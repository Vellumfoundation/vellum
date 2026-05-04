// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract TestERC721 {
    string public name;
    string public symbol;

    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 => address) public getApproved;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);

    constructor(string memory name_, string memory symbol_) {
        name = name_;
        symbol = symbol_;
    }

    function mint(address to, uint256 tokenId) external {
        require(to != address(0), "ERC721: zero to");
        require(ownerOf[tokenId] == address(0), "ERC721: minted");
        ownerOf[tokenId] = to;
        balanceOf[to] += 1;
        emit Transfer(address(0), to, tokenId);
    }

    function approve(address approved, uint256 tokenId) external {
        address owner = ownerOf[tokenId];
        require(msg.sender == owner, "ERC721: not owner");
        getApproved[tokenId] = approved;
        emit Approval(owner, approved, tokenId);
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        address owner = ownerOf[tokenId];
        require(owner == from, "ERC721: wrong from");
        require(msg.sender == owner || msg.sender == getApproved[tokenId], "ERC721: not approved");
        require(to != address(0), "ERC721: zero to");

        delete getApproved[tokenId];
        balanceOf[from] -= 1;
        balanceOf[to] += 1;
        ownerOf[tokenId] = to;

        emit Transfer(from, to, tokenId);
    }
}
