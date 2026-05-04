// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Counter } from "../src/Counter.sol";

interface Vm {
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract DeployCounter {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external {
        vm.startBroadcast();
        new Counter();
        vm.stopBroadcast();
    }
}
