// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.32;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Order {
    // State variables
    address public owner;
    ERC20 public tokenA;
    uint public amountA;
    ERC20 public tokenB;
    uint public amountB;
    uint public orderEndTime;
    uint public nonce;
    bytes32 public signature;
    bool public ended;

    // Events
    event OrderEnded(address winner, uint amount);

    constructor(uint _lifetime) {
        owner = msg.sender;
        orderEndTime = block.timestamp + _lifetime;
    }
    
    function setOwner(address _owner) public{
        require(msg.sender == owner, "Permission denied");
        owner = _owner;
    }
    
    // Use function: allows users to use an order
    function use(address user) public {
        require(block.timestamp < orderEndTime, "Order already ended.");

        ended = true; // like MyToken example, mark as true before doing payment  

        // what's spender? the dApp address? how to get?
        // ERC20(tokenB).approve(spender, value);
        // ERC20(tokenB).transferFrom(from, to, value);

        // tokenA from owner should be approved upon order creation
        // ERC20(tokenA).transferFrom(from, to, value);

        // check for success... SimpleAuction example here for reference
        // (bool success, ) = payable(msg.sender).call{ value: amount }("");
        if (!success) {
            ended = false;
            return false;
        }

        return true;
        emit BidPlaced(msg.sender, msg.value);
    }

    // Cancel the order and send tokens back to the owner
    function cancelOrder() public {
        require(!ended, "Order already ended.");

        ended = true;
        emit OrderEnded(highestBidder, highestBid);

        // Transfer funds to the owner
        // ERC20(tokenA).transferFrom(from, to, value);
        // require(success, "Token transfer failed");
    }
}
