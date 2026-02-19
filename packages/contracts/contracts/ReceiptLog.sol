// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract ReceiptLog is AccessControl {
    bytes32 public constant GATEWAY_ROLE = keccak256("GATEWAY_ROLE");

    struct Receipt {
        bytes32 actionId;
        address agent;
        address payer;
        address asset;
        uint256 amount;
        bytes32 routeId;
        bytes32 paymentRef;
        bytes32 metadataHash;
        uint64 createdAt;
    }

    mapping(bytes32 => Receipt) private receipts;
    mapping(bytes32 => bool) public isRecorded;

    event ReceiptRecorded(
        bytes32 indexed actionId,
        address indexed agent,
        address indexed payer,
        address asset,
        uint256 amount,
        bytes32 routeId,
        bytes32 paymentRef,
        bytes32 metadataHash
    );

    constructor(address admin, address initialGateway) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GATEWAY_ROLE, initialGateway);
    }

    function setGateway(address gateway, bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (enabled) {
            _grantRole(GATEWAY_ROLE, gateway);
        } else {
            _revokeRole(GATEWAY_ROLE, gateway);
        }
    }

    function recordReceipt(
        bytes32 actionId,
        address agent,
        address payer,
        address asset,
        uint256 amount,
        bytes32 routeId,
        bytes32 paymentRef,
        bytes32 metadataHash
    ) external onlyRole(GATEWAY_ROLE) {
        require(!isRecorded[actionId], "action already recorded");
        require(agent != address(0), "invalid agent");
        require(payer != address(0), "invalid payer");
        require(asset != address(0), "invalid asset");
        require(amount > 0, "invalid amount");

        isRecorded[actionId] = true;

        receipts[actionId] = Receipt({
            actionId: actionId,
            agent: agent,
            payer: payer,
            asset: asset,
            amount: amount,
            routeId: routeId,
            paymentRef: paymentRef,
            metadataHash: metadataHash,
            createdAt: uint64(block.timestamp)
        });

        emit ReceiptRecorded(actionId, agent, payer, asset, amount, routeId, paymentRef, metadataHash);
    }

    function getReceipt(bytes32 actionId) external view returns (Receipt memory) {
        require(isRecorded[actionId], "receipt missing");
        return receipts[actionId];
    }
}
