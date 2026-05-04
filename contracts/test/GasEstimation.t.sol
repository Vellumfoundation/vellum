// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";

contract GasEstimationTest is Test {
    function testGasleftIsNonZero() external view {
        assertGt(gasleft(), 0);
    }
}
