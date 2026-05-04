// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Owned } from "./Owned.sol";

contract L3SystemConfigRegistry is Owned {
    uint256 public immutable chainId;
    uint256 public immutable parentChainId;
    string public nativeTokenSymbol;
    bytes32 public rpcUrlHash;
    bytes32 public explorerUrlHash;
    bytes32 public bridgeMetadataHash;
    bytes32 public tokenListHash;

    event ConfigHashesUpdated(
        bytes32 indexed rpcUrlHash,
        bytes32 indexed explorerUrlHash,
        bytes32 bridgeMetadataHash,
        bytes32 tokenListHash
    );

    error InvalidChainId();
    error NativeTokenMustBeEth();

    constructor(uint256 chainId_, uint256 parentChainId_, address initialOwner) Owned(initialOwner) {
        if (chainId_ == 0 || parentChainId_ == 0) revert InvalidChainId();
        chainId = chainId_;
        parentChainId = parentChainId_;
        nativeTokenSymbol = "ETH";
    }

    function updateConfigHashes(
        bytes32 rpcUrlHash_,
        bytes32 explorerUrlHash_,
        bytes32 bridgeMetadataHash_,
        bytes32 tokenListHash_
    ) external onlyOwner {
        rpcUrlHash = rpcUrlHash_;
        explorerUrlHash = explorerUrlHash_;
        bridgeMetadataHash = bridgeMetadataHash_;
        tokenListHash = tokenListHash_;

        emit ConfigHashesUpdated(
            rpcUrlHash_,
            explorerUrlHash_,
            bridgeMetadataHash_,
            tokenListHash_
        );
    }

    function assertNativeTokenIsEth() external view returns (bool) {
        if (keccak256(bytes(nativeTokenSymbol)) != keccak256("ETH")) revert NativeTokenMustBeEth();
        return true;
    }
}
