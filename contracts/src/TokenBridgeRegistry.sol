// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Owned } from "./Owned.sol";

contract TokenBridgeRegistry is Owned {
    struct TokenPair {
        uint256 parentChainId;
        address parentToken;
        uint256 l3ChainId;
        address l3Token;
        string symbol;
        uint8 decimals;
        bool supported;
    }

    mapping(address => TokenPair) private parentToPair;
    mapping(address => TokenPair) private l3ToPair;

    event TokenPairRegistered(
        uint256 indexed parentChainId,
        address indexed parentToken,
        uint256 indexed l3ChainId,
        address l3Token,
        string symbol,
        uint8 decimals
    );

    error InvalidChainId();
    error InvalidDecimals();
    error EmptySymbol();

    constructor(address initialOwner) Owned(initialOwner) {}

    function registerTokenPair(
        uint256 parentChainId,
        address parentToken,
        uint256 l3ChainId,
        address l3Token,
        string calldata symbol,
        uint8 decimals
    ) external onlyOwner {
        if (parentChainId == 0 || l3ChainId == 0) revert InvalidChainId();
        if (parentToken == address(0) || l3Token == address(0)) revert ZeroAddress();
        if (decimals == 0) revert InvalidDecimals();
        if (bytes(symbol).length == 0) revert EmptySymbol();

        TokenPair memory pair = TokenPair({
            parentChainId: parentChainId,
            parentToken: parentToken,
            l3ChainId: l3ChainId,
            l3Token: l3Token,
            symbol: symbol,
            decimals: decimals,
            supported: true
        });

        parentToPair[parentToken] = pair;
        l3ToPair[l3Token] = pair;

        emit TokenPairRegistered(parentChainId, parentToken, l3ChainId, l3Token, symbol, decimals);
    }

    function getTokenPairByParent(address parentToken) external view returns (TokenPair memory) {
        return parentToPair[parentToken];
    }

    function getTokenPairByL3(address l3Token) external view returns (TokenPair memory) {
        return l3ToPair[l3Token];
    }

    function getL3Token(address parentToken) external view returns (address) {
        return parentToPair[parentToken].l3Token;
    }

    function getParentToken(address l3Token) external view returns (address) {
        return l3ToPair[l3Token].parentToken;
    }

    function isSupportedParentToken(address parentToken) external view returns (bool) {
        return parentToPair[parentToken].supported;
    }

    function isSupportedL3Token(address l3Token) external view returns (bool) {
        return l3ToPair[l3Token].supported;
    }
}
