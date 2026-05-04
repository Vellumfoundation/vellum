// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { TokenBridgeRegistry } from "../src/TokenBridgeRegistry.sol";

contract BridgeRegistryTest is Test {
    function testRegistersTokenPair() external {
        TokenBridgeRegistry registry = new TokenBridgeRegistry(address(this));
        registry.registerTokenPair(8453, address(0xBEEF), 90103, address(0xCAFE), "TEST", 18);
        assertEq(registry.getL3Token(address(0xBEEF)), address(0xCAFE));
        assertTrue(registry.isSupportedParentToken(address(0xBEEF)));
    }
}
