// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.32;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Order {
    // State variables
    address public seller;
    address public spender;
    address public tokenA;
    address public tokenB;
    uint public amountA;
    uint public amountB;
    uint public orderEndTime;
    uint public nonce;
    bytes32 public signature;
    bool public ended;

    // Events
    event OrderEnded();

    constructor(uint _lifetime) {
        spender = msg.sender;
        orderEndTime = block.timestamp + _lifetime;
    }

    function setSeller(address _seller) public {
        require(msg.sender == spender, "Permission denied");
        seller = _seller;
    }

    function initialize(address _tokenA, address _tokenB, uint _amountA, uint _amountB) external {
        require(msg.sender == spender, 'Permission denied');
        tokenA = _tokenA;
        tokenB = _tokenB;
        amountA = _amountA;
        amountB = _amountB;
    }

    // Use function: allows users to use an order
    function use() public returns (bool) {
        require(!ended, "Order already ended.");
        require(block.timestamp < orderEndTime, "Order already ended.");

        // like MyToken example, mark as true before doing payment? 
        // to prevent reentrancy attack? 
        ended = true; 

        // Note on ERC20:transferFrom... 
        // forge gives a warning that we should check for return value
        // this is good for checking transfer success
        // however this forum thread recommends SafeERC20? 
        // thread: https://forum.openzeppelin.com/t/should-i-check-for-transfer-result-for-an-erc20/37018
        // SafeERC20: https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/utils/SafeERC20.sol 

        // tokenB from msg.sender should be approved for spender to call this:
        // similar to Exchange:createOrder(), check via ERC20 allowance?
        ERC20(tokenB).transferFrom(msg.sender, seller, amountB);

        // tokenA from seller should be approved for spender to call this:
        ERC20(tokenA).transferFrom(seller, msg.sender, amountA);

        // check for success [how?]

        return true;
    }

    // Cancel the order (can only be called by the seller)
    // TBD: how does this play into ERC20 allowance?
    function cancelOrder() public {
        require(msg.sender == seller, "Permission denied");
        require(!ended, "Order already ended.");
        require(block.timestamp < orderEndTime, "Order already ended.");

        ended = true;
        emit OrderEnded();
    }
}
