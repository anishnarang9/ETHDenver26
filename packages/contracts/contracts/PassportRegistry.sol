// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract PassportRegistry is Ownable {
    struct Passport {
        address owner;
        address agent;
        uint64 expiresAt;
        uint128 perCallCap;
        uint128 dailyCap;
        uint32 rateLimitPerMin;
        bool revoked;
        uint32 version;
        uint64 updatedAt;
    }

    mapping(address => Passport) private passports;
    mapping(address => bytes32[]) private scopeList;
    mapping(address => bytes32[]) private serviceList;
    mapping(address => mapping(bytes32 => bool)) private scopeAllowed;
    mapping(address => mapping(bytes32 => bool)) private serviceAllowed;

    event PassportUpserted(
        address indexed owner,
        address indexed agent,
        uint64 expiresAt,
        uint128 perCallCap,
        uint128 dailyCap,
        uint32 rateLimitPerMin,
        uint32 version
    );
    event PassportRevoked(address indexed owner, address indexed agent, uint64 revokedAt);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function upsertPassport(
        address agent,
        uint64 expiresAt,
        uint128 perCallCap,
        uint128 dailyCap,
        uint32 rateLimitPerMin,
        bytes32[] calldata scopes,
        bytes32[] calldata services
    ) external {
        require(agent != address(0), "invalid agent");
        require(expiresAt > block.timestamp, "invalid expiry");

        Passport storage existing = passports[agent];

        if (existing.owner == address(0)) {
            existing.owner = msg.sender;
            existing.agent = agent;
            existing.version = 1;
        } else {
            require(existing.owner == msg.sender, "not owner");
            unchecked {
                existing.version += 1;
            }
            _clearPolicies(agent);
        }

        existing.expiresAt = expiresAt;
        existing.perCallCap = perCallCap;
        existing.dailyCap = dailyCap;
        existing.rateLimitPerMin = rateLimitPerMin;
        existing.revoked = false;
        existing.updatedAt = uint64(block.timestamp);

        _setPolicies(agent, scopes, services);

        emit PassportUpserted(msg.sender, agent, expiresAt, perCallCap, dailyCap, rateLimitPerMin, existing.version);
    }

    function revokePassport(address agent) external {
        Passport storage passport = passports[agent];
        require(passport.owner != address(0), "passport missing");
        require(passport.owner == msg.sender, "not owner");
        passport.revoked = true;
        passport.updatedAt = uint64(block.timestamp);

        emit PassportRevoked(msg.sender, agent, uint64(block.timestamp));
    }

    function getPassport(address agent)
        external
        view
        returns (
            address owner,
            address agentAddress,
            uint64 expiresAt,
            uint128 perCallCap,
            uint128 dailyCap,
            uint32 rateLimitPerMin,
            bool revoked,
            uint32 version,
            uint64 updatedAt,
            bytes32[] memory scopes,
            bytes32[] memory services
        )
    {
        Passport storage passport = passports[agent];
        return (
            passport.owner,
            passport.agent,
            passport.expiresAt,
            passport.perCallCap,
            passport.dailyCap,
            passport.rateLimitPerMin,
            passport.revoked,
            passport.version,
            passport.updatedAt,
            scopeList[agent],
            serviceList[agent]
        );
    }

    function ownerOfAgent(address agent) external view returns (address) {
        return passports[agent].owner;
    }

    function isRevoked(address agent) external view returns (bool) {
        return passports[agent].revoked;
    }

    function isExpired(address agent) external view returns (bool) {
        Passport storage passport = passports[agent];
        return passport.expiresAt != 0 && block.timestamp >= passport.expiresAt;
    }

    function isScopeAllowed(address agent, bytes32 scope) external view returns (bool) {
        Passport storage passport = passports[agent];
        if (passport.owner == address(0) || passport.revoked || block.timestamp >= passport.expiresAt) {
            return false;
        }
        return scopeAllowed[agent][scope];
    }

    function isServiceAllowed(address agent, bytes32 service) external view returns (bool) {
        Passport storage passport = passports[agent];
        if (passport.owner == address(0) || passport.revoked || block.timestamp >= passport.expiresAt) {
            return false;
        }
        return serviceAllowed[agent][service];
    }

    function _clearPolicies(address agent) private {
        bytes32[] storage existingScopes = scopeList[agent];
        for (uint256 i = 0; i < existingScopes.length; i++) {
            scopeAllowed[agent][existingScopes[i]] = false;
        }
        delete scopeList[agent];

        bytes32[] storage existingServices = serviceList[agent];
        for (uint256 i = 0; i < existingServices.length; i++) {
            serviceAllowed[agent][existingServices[i]] = false;
        }
        delete serviceList[agent];
    }

    function _setPolicies(address agent, bytes32[] calldata scopes, bytes32[] calldata services) private {
        for (uint256 i = 0; i < scopes.length; i++) {
            bytes32 scope = scopes[i];
            if (!scopeAllowed[agent][scope]) {
                scopeAllowed[agent][scope] = true;
                scopeList[agent].push(scope);
            }
        }

        for (uint256 i = 0; i < services.length; i++) {
            bytes32 service = services[i];
            if (!serviceAllowed[agent][service]) {
                serviceAllowed[agent][service] = true;
                serviceList[agent].push(service);
            }
        }
    }
}
