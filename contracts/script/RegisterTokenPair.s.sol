// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";

contract RegisterTokenPair is Script {
    function run() external pure {
        revert("Set TOKEN_BRIDGE_REGISTRY and token env vars before registering pairs.");
    }
}
