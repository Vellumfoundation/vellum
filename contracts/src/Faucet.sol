// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Owned } from "./Owned.sol";

contract Faucet is Owned {
    uint256 public dripAmount;
    uint256 public cooldownSeconds;
    bool public paused;

    mapping(address => uint256) public lastDripAt;

    event Dripped(address indexed recipient, uint256 amount);
    event FaucetConfigured(uint256 dripAmount, uint256 cooldownSeconds);
    event Paused(bool paused);

    error FaucetPaused();
    error CooldownActive();
    error InsufficientFaucetBalance();

    constructor(address initialOwner, uint256 dripAmount_, uint256 cooldownSeconds_) Owned(initialOwner) {
        dripAmount = dripAmount_;
        cooldownSeconds = cooldownSeconds_;
        emit FaucetConfigured(dripAmount_, cooldownSeconds_);
    }

    receive() external payable {}

    function drip(address payable recipient) external {
        if (paused) revert FaucetPaused();
        if (block.timestamp < lastDripAt[recipient] + cooldownSeconds) revert CooldownActive();
        if (address(this).balance < dripAmount) revert InsufficientFaucetBalance();

        lastDripAt[recipient] = block.timestamp;
        recipient.transfer(dripAmount);

        emit Dripped(recipient, dripAmount);
    }

    function configure(uint256 dripAmount_, uint256 cooldownSeconds_) external onlyOwner {
        dripAmount = dripAmount_;
        cooldownSeconds = cooldownSeconds_;
        emit FaucetConfigured(dripAmount_, cooldownSeconds_);
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit Paused(paused_);
    }

    function withdraw(address payable recipient, uint256 amount) external onlyOwner {
        recipient.transfer(amount);
    }
}
