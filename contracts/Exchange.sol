// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.32;

import { Order } from "./Order.sol";

contract Exchange {

    // Events
    event OrderDeployed(
        address indexed order,
        address indexed seller,
        address tokenA,
        address tokenB,
        uint amountA,
        uint amountB,
        uint lifetime
    );

    function createOrder(address tokenA, address tokenB, uint amountA, uint amountB, uint lifetime, bool emitOnChain) public returns (address) {
        // TBD: check via ERC20 allowance(seller, spender) that Exchance is allowed to 
        Order order = new Order(lifetime);
        order.setSeller(msg.sender);
        order.initialize(tokenA, tokenB, amountA, amountB);
        if (emitOnChain) {
            emit OrderDeployed(address(order), msg.sender, tokenA, tokenB, amountA, amountB, lifetime);
        }
        return address(order);
    }
}
