// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.32;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {FixedPointMathLib} from "@solmate/src/utils/FixedPointMathLib.sol";

contract Exchange is EIP712 {
    using ECDSA for bytes32;
    
    bytes32 public constant ORDER_TYPEHASH = keccak256(
        "Order(address seller,address tokenA,address tokenB,uint256 amountA,uint256 amountB,uint256 deadline,uint256 nonce)"
    );

    // Keep track of sellers' active order
    mapping(address => uint256) public activeOrders;

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
        bytes signature
    );

	  constructor() EIP712("GurtEX", "1") {}

    function createOrder(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        uint256 deadline,
        uint256 nonce,
        bytes memory signature,
        bool postOnChain
    ) public returns (bool) {
        // Verify order values
        require(tokenA != address(0), "Invalid tokenA");
        require(tokenB != address(0), "Invalid tokenB");
        require(amountA > 0, "Value amountA must be positive");
        require(amountB > 0, "Value amountB must be positive");
        require(deadline > block.timestamp, "Deadline must be in the future");
        // Verify signature
        bytes32 hash = _hashTypedDataV4(keccak256(
            abi.encode(
                ORDER_TYPEHASH,
                msg.sender,
                tokenA,
                tokenB,
                amountA,
                amountB,
                deadline,
                nonce
            )
        ));
        require(!used[hash], "Cannot create an order that has already been filled");
        // Check that the signer is the msg.sender
        address signer = ECDSA.recover(hash, signature);
        require(signer == msg.sender, "Invalid signature");
        // Keep track of seller's order
        activeOrders[msg.sender] = deadline;
        // Optionally broadcast order on chain
        if (postOnChain) {
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

    function cancelActiveOrder() public {
        activeOrders[msg.sender] = 0;
    }

    function fillOrder(
        address seller,
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        uint256 deadline,
        uint256 nonce,
        bytes memory signature,
        uint256 offer
    ) public returns (bool) {
        // Check that the order is active
        require(activeOrders[seller] == deadline, "Order is inactive");
        // Check if the order has expired
        require(block.timestamp <= deadline, "Order has expired");
        // Create the hash assuming the seller allows the transaction caller to spend amount of token
        bytes32 hash = _hashTypedDataV4(keccak256(
            abi.encode(
                ORDER_TYPEHASH,
                seller,
                tokenA,
                tokenB,
                amountA,
                amountB,
                deadline,
                nonce
            )
        ));
        // Check if the order has been fully used already
        require(!used[hash], "Order has been filled already");
        // Extract the signer
        address from = ECDSA.recover(hash, signature);
        // Check that the signer is the seller
        if (from != seller) {
            return false;
        }
        // Mark the order as used if fully used? check ERC20 allowance?
        used[hash] = true;
        // Token exchange (check that this contract can spend on behalf of msg.sender)
        require(ERC20(tokenB).allowance(msg.sender, address(this)) >= offer, "Buyer has not approved GurtEX");
        // Note on ERC20:transferFrom... 
        // this forum thread recommends SafeERC20? 
        // thread: https://forum.openzeppelin.com/t/should-i-check-for-transfer-result-for-an-erc20/37018
        // SafeERC20: https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/utils/SafeERC20.sol

        // Fixed Point Math from https://rareskills.io/post/solidity-fixed-point#converting-an-integer-to-a-fixed-point-number
        // Github: https://github.com/transmissions11/solmate/blob/main/src/utils/FixedPointMathLib.sol
        uint256 amountToTransfer = FixedPointMathLib.mulDivDown(offer, amountA, amountB);

        bool success = ERC20(tokenA).transferFrom(from, msg.sender, amountToTransfer);
        require(success, "Failed to transfer tokenA");
        success = ERC20(tokenB).transferFrom(msg.sender, from, offer);
        require(success, "Failed to transfer tokenB");
        return true;
    }
}
