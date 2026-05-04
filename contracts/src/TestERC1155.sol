// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract TestERC1155 {
    mapping(uint256 => mapping(address => uint256)) public balanceOf;
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    event TransferSingle(
        address indexed operator,
        address indexed from,
        address indexed to,
        uint256 id,
        uint256 value
    );
    event ApprovalForAll(address indexed account, address indexed operator, bool approved);

    function mint(address to, uint256 id, uint256 amount) external {
        require(to != address(0), "ERC1155: zero to");
        balanceOf[id][to] += amount;
        emit TransferSingle(msg.sender, address(0), to, id, amount);
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata) external {
        require(from == msg.sender || isApprovedForAll[from][msg.sender], "ERC1155: not approved");
        require(to != address(0), "ERC1155: zero to");
        require(balanceOf[id][from] >= amount, "ERC1155: balance");

        balanceOf[id][from] -= amount;
        balanceOf[id][to] += amount;

        emit TransferSingle(msg.sender, from, to, id, amount);
    }
}
