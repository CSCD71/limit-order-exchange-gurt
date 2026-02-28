// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.32;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract Exchange is EIP712 {
    using ECDSA for bytes32;
    
    bytes32 public constant ORDER_TYPEHASH = keccak256(
        "Order(address seller,address tokenA,address tokenB,uint256 amountA,uint256 amountB,uint256 deadline,uint256 nonce)"
    );

    // Keep track of used orders
    mapping(bytes32 => bool) public used;

    // Event that allows sellers to publish orders on-chain
    event OrderPosted(
        address seller,
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        uint256 deadline,
        uint256 nonce,
        bytes32 signature
    );

	  constructor() EIP712("GurtEX", "1") {}

    function createOrder(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        uint256 deadline,
        uint256 nonce,
        bytes32 signature,
        bool emitOnChain
    ) public returns (bool) {
        // TBD: verify order values?
        if (emitOnChain) {
            emit OrderPosted(
              msg.sender,
              tokenA,
              tokenB,
              amountA,
              amountB,
              deadline,
              nonce,
              signature
            );
        }
        return true;
    }

    function fillOrder(
        address seller,
        address spender,
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        uint256 deadline,
        uint256 nonce,
        bytes32 signature,
        uint256 offer
    ) public returns (bool) {
        // check if the order has expired
        require(block.timestamp <= deadline, "Order has expired");
        // create the hash assuming the seller allows the transaction caller to spend amount of token
        bytes32 structHash = keccak256(
            abi.encode(
                ORDER_TYPEHASH,
                seller,
                spender,
                tokenA,
                tokenB,
                amountA,
                amountB,
                deadline,
                nonce
            )
        );
        bytes32 hash = _hashTypedDataV4(structHash);
        // check if the order has been fully used already
        require(!used[hash], "Order has been filled already");
        // extract the signer
        address from = ECDSA.recover(hash, signature);
        // check that the signer is the seller
        if (from != seller) {
            return false;
        }
        // mark the order as used if fully used? check ERC20 allowance?
        used[hash] = true;
        // token exchange (check that this contract can spend on behalf of msg.sender)
        ERC20(tokenA).transferFrom(seller, msg.sender, offer/amountB * amountA); // need safer math
        ERC20(tokenB).transferFrom(msg.sender, seller, offer);
        return true;
    }
}
