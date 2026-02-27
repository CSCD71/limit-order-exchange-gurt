// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.32;

import { Order } from "./Order.sol";

contract Exchange {

    // Events
    event OrderDeployed(
        address indexed auction, 
        address indexed owner,
        string label,
        uint lifetime
    );
	
    function createOrder(string calldata label, uint lifetime, bool emitOnChain) public {
        Order order = new Order(lifetime);
        order.setOwner(msg.sender);
        if (emitOnChain) {
            emit OrderDeployed(address(order), msg.sender, label, lifetime);
        }
    }
}
