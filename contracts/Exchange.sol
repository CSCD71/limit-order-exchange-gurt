// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.32;

import { Order } from "./Order.sol";

contract Exchange {

    /*
    //Store current available orders
    struct Order {
        address seller;
        address tokenA;
        address tokenB;
        uint amountA;
        uint amountB;
        uint filledAmountA;
        uint filledAmountB;
        uint lifetime;
        uint nonce;
        bytes signature;
    }
    mapping(uint => Order) public orders;
    */
    uint public orderCount = 0; // Simple incrementor for order IDs
    mapping(uint => bool) public usedNonces;
    mapping(address -> uint) public deadlines;

    // Events for off-chain order book tracking
    event OrderDeployed(
        uint indexed orderId,
        address indexed seller,
        address tokenA,
        address tokenB,
        uint amountA,
        uint amountB,
        uint deadline,
        uint nonce,
        bytes signature
    );
    event OrderFilled(
        uint indexed orderId,
        address indexed buyer,
        uint amountAFilled,
        uint amountBFilled
    );
    event OrderCancelled(uint indexed orderId);

    function createOrder(
        address tokenA,
        address tokenB,
        uint amountA,
        uint amountB,
        uint lifetime,
        uint nonce,
        bytes signature
    ) public returns (uint) {
        require(amountA > 0 && amountB > 0, "Invalid amounts");
        
        uint orderId = orderCount++;
        /*
        orders[orderId] = Order({
            seller: msg.sender,
            tokenA: tokenA,
            tokenB: tokenB,
            amountA: amountA,
            amountB: amountB,
            filledAmountA: 0,
            filledAmountB: 0,
            deadline: block.timestamp + lifetime,
            nonce: nonce,
            signature: signature
        });
        */
        // Todo: Validate signature
        emit OrderDeployed(orderId, msg.sender, tokenA, tokenB, amountA, amountB, block.timestamp + lifetime, nonce, signature);
        return orderId;
    }

    // Fill an order partially by specifying how much tokenA you want
    // Todo: bulk orders
    function fillOrder(
        address seller,
        address tokenA,
        address tokenB,
        uint amountA,
        uint amountB,
        uint lifetime,
        uint nonce,
        bytes signature,
        uint desiredAmountA,
        uint orderId) public returns (bool) {
        // Todo: Validate signature and nonce, check for replay attack
        /*
        Order storage order = orders[orderId];
        
        require(order, "Order does not exist or was cancelled");
        require(block.timestamp < order.deadline, "Order expired");
        require(order.filledAmountA < order.amountA, "Order fully filled");
        */
        
        // This section also needs editing
        uint remainingAmountA = order.amountA - order.filledAmountA;
        uint remainingAmountB = order.amountB - order.filledAmountB;
        
        // Clamp to remaining amount
        uint amountAToFill = desiredAmountA > remainingAmountA ? remainingAmountA : desiredAmountA;
        
        // Calculate proportional tokenB needed for this amount of tokenA
        uint amountBToFill = (amountAToFill * remainingAmountB) / remainingAmountA;
        
        order.filledAmountA += amountAToFill;
        order.filledAmountB += amountBToFill;
        
        // Buyer sends tokenB to seller
        ERC20(order.tokenB).transferFrom(msg.sender, order.seller, amountBToFill);
        
        // Seller sends tokenA to buyer
        ERC20(order.tokenA).transferFrom(order.seller, msg.sender, amountAToFill);

        // Todo: Make sure to check that transfers succeeded
        
        emit OrderFilled(orderId, msg.sender, amountAToFill, amountBToFill);
        return true;
    }

    function cancelOrder(
        address seller,
        address tokenA,
        address tokenB,
        uint amountA,
        uint amountB,
        uint lifetime,
        uint nonce,
        bytes signature,
        uint orderId) public {
        /*
        Order storage order = orders[orderId];
        require(order, "Order does not exist or already cancelled");
        */
        require(msg.sender == seller, "Only seller can cancel");
        
        //delete orders[orderId];
        // Todo: Mark nonce as used, reset seller deadline.
        emit OrderCancelled(orderId);
    }

    // Don't know if this is necessary, needs review
    function getOrder(uint orderId) public view returns (Order memory) {
        return orders[orderId];
    }
}
