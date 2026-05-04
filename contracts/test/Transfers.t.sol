// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { TestERC20 } from "../src/TestERC20.sol";

contract TransfersTest is Test {
    function testErc20Transfer() external {
        TestERC20 token = new TestERC20("Test Token", "TEST", 18);
        token.mint(address(this), 100 ether);
        token.transfer(address(0xBEEF), 10 ether);
        assertEq(token.balanceOf(address(0xBEEF)), 10 ether);
    }
}
