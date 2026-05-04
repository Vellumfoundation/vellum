// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";
import { TokenBridgeRegistry } from "../src/TokenBridgeRegistry.sol";
import { L3SystemConfigRegistry } from "../src/L3SystemConfigRegistry.sol";

contract DeployMainnet is Script {
    function run() external {
        vm.startBroadcast();
        new TokenBridgeRegistry(msg.sender);
        new L3SystemConfigRegistry(block.chainid, 8453, msg.sender);
        vm.stopBroadcast();
    }
}
