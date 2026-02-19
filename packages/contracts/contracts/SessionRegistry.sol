// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPassportRegistry {
    function ownerOfAgent(address agent) external view returns (address);
}

contract SessionRegistry {
    struct Session {
        address owner;
        address agent;
        address session;
        uint64 expiresAt;
        bool revoked;
        uint64 updatedAt;
    }

    IPassportRegistry public immutable passportRegistry;

    mapping(address => Session) private sessions;
    mapping(address => bytes32[]) private sessionScopes;
    mapping(address => mapping(bytes32 => bool)) private scopeAllowed;

    event SessionGranted(
        address indexed owner,
        address indexed agent,
        address indexed session,
        uint64 expiresAt,
        uint64 grantedAt
    );
    event SessionRevoked(address indexed owner, address indexed session, uint64 revokedAt);

    constructor(address passportRegistryAddress) {
        require(passportRegistryAddress != address(0), "invalid registry");
        passportRegistry = IPassportRegistry(passportRegistryAddress);
    }

    function grantSession(
        address agent,
        address session,
        uint64 expiresAt,
        bytes32[] calldata scopeSubset
    ) external {
        require(agent != address(0), "invalid agent");
        require(session != address(0), "invalid session");
        require(expiresAt > block.timestamp, "invalid expiry");

        address passportOwner = passportRegistry.ownerOfAgent(agent);
        require(passportOwner != address(0), "agent unregistered");
        require(passportOwner == msg.sender, "not owner");

        Session storage existing = sessions[session];
        if (existing.owner != address(0)) {
            require(existing.owner == msg.sender, "session owner mismatch");
            _clearSessionScopes(session);
        }

        existing.owner = msg.sender;
        existing.agent = agent;
        existing.session = session;
        existing.expiresAt = expiresAt;
        existing.revoked = false;
        existing.updatedAt = uint64(block.timestamp);

        _setSessionScopes(session, scopeSubset);

        emit SessionGranted(msg.sender, agent, session, expiresAt, uint64(block.timestamp));
    }

    function revokeSession(address session) external {
        Session storage existing = sessions[session];
        require(existing.owner != address(0), "session missing");
        require(existing.owner == msg.sender, "not owner");
        existing.revoked = true;
        existing.updatedAt = uint64(block.timestamp);

        emit SessionRevoked(msg.sender, session, uint64(block.timestamp));
    }

    function getSession(address session)
        external
        view
        returns (address owner, address agent, address sessionAddress, uint64 expiresAt, bool revoked, uint64 updatedAt, bytes32[] memory scopes)
    {
        Session storage existing = sessions[session];
        return (
            existing.owner,
            existing.agent,
            existing.session,
            existing.expiresAt,
            existing.revoked,
            existing.updatedAt,
            sessionScopes[session]
        );
    }

    function isSessionActive(address session) external view returns (bool) {
        Session storage existing = sessions[session];
        return existing.owner != address(0) && !existing.revoked && block.timestamp < existing.expiresAt;
    }

    function hasScope(address session, bytes32 scope) external view returns (bool) {
        Session storage existing = sessions[session];
        if (existing.owner == address(0) || existing.revoked || block.timestamp >= existing.expiresAt) {
            return false;
        }

        bytes32[] storage scopes = sessionScopes[session];
        if (scopes.length == 0) {
            return true;
        }

        return scopeAllowed[session][scope];
    }

    function _clearSessionScopes(address session) private {
        bytes32[] storage scopes = sessionScopes[session];
        for (uint256 i = 0; i < scopes.length; i++) {
            scopeAllowed[session][scopes[i]] = false;
        }
        delete sessionScopes[session];
    }

    function _setSessionScopes(address session, bytes32[] calldata scopeSubset) private {
        for (uint256 i = 0; i < scopeSubset.length; i++) {
            bytes32 scope = scopeSubset[i];
            if (!scopeAllowed[session][scope]) {
                scopeAllowed[session][scope] = true;
                sessionScopes[session].push(scope);
            }
        }
    }
}
