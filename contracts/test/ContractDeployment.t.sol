// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";

contract ContractDeploymentTest is Test {
    function testBlockChainIdIsAvailable() external view {
        assertGt(block.chainid, 0);
    }
}
