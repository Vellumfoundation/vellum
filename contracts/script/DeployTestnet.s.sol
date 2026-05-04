// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";
import { TokenBridgeRegistry } from "../src/TokenBridgeRegistry.sol";
import { L3SystemConfigRegistry } from "../src/L3SystemConfigRegistry.sol";
import { Faucet } from "../src/Faucet.sol";

contract DeployTestnet is Script {
    function run() external {
        vm.startBroadcast();
        new TokenBridgeRegistry(msg.sender);
        new L3SystemConfigRegistry(block.chainid, 84532, msg.sender);
        new Faucet(msg.sender, 0.005 ether, 1 days);
        vm.stopBroadcast();
    }
}
