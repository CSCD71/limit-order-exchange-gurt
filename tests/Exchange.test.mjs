import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, describe, it, beforeAll, afterAll } from 'vitest';

import { createPublicClient, createWalletClient, http, parseEther, decodeEventLog, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const rpc = http("http://127.0.0.1:8545");
const client = await createPublicClient({ chain: foundry, transport: rpc });

const privateKeys = [
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
    "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
    "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
    "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
    "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
    "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356",
    "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97",
    "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6",
];

let tokenAddresses = [];
let tokenABIs = [];

/*
const sampleTokens = [
    "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    "0x3e622317f8C93f7328350cF0B56d9eD4C620C5d6",
]
*/

function loadContract(contract) {
  const content = readFileSync(join('out', `${contract}.sol`, `${contract}.json`), "utf8");
  const artifact = JSON.parse(content);
  return { abi: artifact.abi, bytecode: artifact.bytecode.object };
}

let nonce = 0n;

function getNonce() {
    return nonce++;
}

async function signOrderWithEIP712(
  tokenA,
  tokenB,
  amountA,
  amountB,
  deadline,
  nonce,
  seller,        // Pass the wallet client
  contractAddress,
  chainId
) {
  const typedData = {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" }
      ],
      Order: [
        { name: "seller", type: "address" },
        { name: "tokenA", type: "address" },
        { name: "tokenB", type: "address" },
        { name: "amountA", type: "uint256" },
        { name: "amountB", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "nonce", type: "uint256" }
      ]
    },
    primaryType: "Order",
    domain: {
      name: "GurtEX",
      version: "1",
      chainId: chainId,
      verifyingContract: contractAddress
    },
    message: {
      seller: seller.account.address,
      tokenA: tokenA,
      tokenB: tokenB,
      amountA: amountA,
      amountB: amountB,
      deadline: deadline,
      nonce: nonce
    }
  };

  return await seller.signTypedData(typedData);
}

describe("Exchange", function () {
	
    let seller1, seller2, buyer1, buyer2, buyer3, // wallet
        contract;                                 // contract
    
    const receipts = [];
    
    let currentTime;
    const tokenAQuantity1 = parseEther("1");
    const tokenBQuantity1 = parseEther("1");
    const offer1 = parseEther("1");
    //const biddingTime = BigInt(60);
    //const firstBid = parseEther("1");
    //const secondBid = parseEther("2");
    
    afterAll(async () =>{
        if (receipts.length === 0) return;

        console.log("\n=== Gas / ETH cost summary ===");
        
        for (const {label, receipt} of receipts){
            const costWei = receipt.gasUsed * receipt.effectiveGasPrice;
            console.log(`• ${label}\n  gas: ${receipt.gasUsed} | cost: ${formatEther(costWei)} ETH`);
        }
        console.log("================================\n");
    });
    
    beforeAll(async () => {
        // create wallets
        [,,seller1, seller2, buyer1, buyer2, buyer3] = await Promise.all(privateKeys.map(function(pk){
            return createWalletClient({ chain: foundry, transport: rpc , account: privateKeyToAccount(pk) });
        })); 
        // compile the contract
        const { abi, bytecode } = loadContract("Exchange");        
        // deploy contract
        const hash = await seller1.deployContract({
            abi,
            bytecode,
            args: []
        });
        // wait for the transaction to be confirmed
        const receipt = await client.waitForTransactionReceipt({ hash });
        receipts.push({label: "Deployment", receipt});
        const block = await client.getBlock({ blockNumber: receipt.blockNumber });
        currentTime = block.timestamp;
        const address = receipt.contractAddress;
        contract = {address, abi};
        // compile mock tokens contract
        const { abi: abi2, bytecode: bytecode2 } = loadContract("MockERC20");
        const { abi: abi3, bytecode: bytecode3 } = loadContract("MockERC20");
        // deploy mock tokens
        const hash2 = await seller1.deployContract({
            abi: abi2,
            bytecode: bytecode2,
            args: ["TokenA", "TKA"]
        });
        const hash3 = await seller1.deployContract({
            abi: abi3,
            bytecode: bytecode3,
            args: ["TokenB", "TKB"]
        });
        const receipt2 = await client.waitForTransactionReceipt({ hash: hash2 });
        const receipt3 = await client.waitForTransactionReceipt({ hash: hash3 });
        receipts.push({label: "Deployment TokenA", receipt: receipt2});
        receipts.push({label: "Deployment TokenB", receipt: receipt3});
        tokenAddresses.push(receipt2.contractAddress);
        tokenAddresses.push(receipt3.contractAddress);
        tokenABIs.push(abi2);
        tokenABIs.push(abi3);
    });
    
    describe("Sell Order", function (){
        let receipt;
        let signature;
        const time = BigInt(60);
        const nonce = getNonce();
        beforeAll(async () => {
            // Mint tokens to seller1
            await seller1.writeContract({ address: tokenAddresses[0], abi: tokenABIs[0], functionName: "mint", args: [seller1.account.address, parseEther("1")] });
            signature = await signOrderWithEIP712(
                tokenAddresses[0],
                tokenAddresses[1],
                parseEther("1"),
                parseEther("1"),
                currentTime + time,
                nonce,
                seller1,
                contract.address,
                foundry.id
            );
            const { address, abi } = contract;
            const hash = await seller1.writeContract({ address, abi, functionName: "createOrder", args: [tokenAddresses[0], tokenAddresses[1], parseEther("1"), parseEther("1"), currentTime + time, nonce, signature, true] });
            receipt = await client.waitForTransactionReceipt({ hash });
            receipts.push({label: "Sell Order", receipt});
        });
        it("Should have emitted the correct event", async function () {
             const { address, abi } = contract;
            // check the logs looking of events
            expect(receipt.logs).toHaveLength(1);
            const log = receipt.logs[0];
            // parse and check event
            const { args, eventName } = decodeEventLog({abi, data: log.data, topics: log.topics });
            expect(eventName).to.equal('OrderPosted');
            expect(args.seller).to.equal(seller1.account.address);
            expect(args.tokenA).to.equal(tokenAddresses[0]);
            expect(args.tokenB).to.equal(tokenAddresses[1]);
            expect(args.amountA).to.equal(parseEther("1"));
            expect(args.amountB).to.equal(parseEther("1"));
            expect(args.deadline).to.equal(currentTime + time);
            expect(args.nonce).to.equal(nonce);
            expect(args.signature).to.equal(signature);
        });
    });

    describe("Buy Order", function (){
        let receipt;
        let receipt2;
        let balanceA1Before, balanceB1Before, balanceA2Before, balanceB2Before;
        let signature;
        const time = BigInt(60);
        const nonce = getNonce();
        beforeAll(async () => {
            // Mint tokens to seller1 and buyer1
            await seller1.writeContract({ address: tokenAddresses[0], abi: tokenABIs[0], functionName: "mint", args: [seller1.account.address, parseEther("1")] });
            await buyer1.writeContract({ address: tokenAddresses[1], abi: tokenABIs[1], functionName: "mint", args: [buyer1.account.address, parseEther("1")] });
            
            balanceA1Before = await buyer1.readContract({ address: tokenAddresses[0], abi: tokenABIs[0], functionName: "balanceOf", args: [buyer1.account.address] });
            balanceB1Before = await buyer1.readContract({ address: tokenAddresses[1], abi: tokenABIs[1], functionName: "balanceOf", args: [buyer1.account.address] });
            balanceA2Before = await seller1.readContract({ address: tokenAddresses[0], abi: tokenABIs[0], functionName: "balanceOf", args: [seller1.account.address] });
            balanceB2Before = await seller1.readContract({ address: tokenAddresses[1], abi: tokenABIs[1], functionName: "balanceOf", args: [seller1.account.address] });

            signature = await signOrderWithEIP712(
                tokenAddresses[0],
                tokenAddresses[1],
                parseEther("1"),
                parseEther("1"),
                currentTime + time,
                nonce,
                seller1,
                contract.address,
                foundry.id
            );
            const { address, abi } = contract;
            const hash = await seller1.writeContract({ address, abi, functionName: "createOrder", args: [tokenAddresses[0], tokenAddresses[1], parseEther("1"), parseEther("1"), currentTime + time, nonce, signature, true] });
            receipt = await client.waitForTransactionReceipt({ hash });
            receipts.push({label: "Sell Order", receipt});

            // Approve the exchange contract to transfer tokens on behalf of buyer1
            await buyer1.writeContract({ address: tokenAddresses[0], abi: tokenABIs[0], functionName: "approve", args: [contract.address, parseEther("1")] });
            // and on behalf of seller1
            await seller1.writeContract({ address: tokenAddresses[1], abi: tokenABIs[1], functionName: "approve", args: [contract.address, parseEther("1")] });
            // Create buy order
            const hash2 = await buyer1.writeContract({ address, abi, functionName: "fillOrder", args: [seller1.account.address, tokenAddresses[0], tokenAddresses[1], parseEther("1"), parseEther("1"), currentTime + time, nonce, signature, parseEther("1")] });
            receipt2 = await client.waitForTransactionReceipt({ hash: hash2 });
            receipts.push({label: "Buy Order", receipt: receipt2});
        });
        it("Should have transferred the tokens correctly", async function () {
            const balanceA1After = await buyer1.readContract({ address: tokenAddresses[0], abi: tokenABIs[0], functionName: "balanceOf", args: [buyer1.account.address] });
            const balanceB1After = await buyer1.readContract({ address: tokenAddresses[1], abi: tokenABIs[1], functionName: "balanceOf", args: [buyer1.account.address] });
            const balanceA2After = await seller1.readContract({ address: tokenAddresses[0], abi: tokenABIs[0], functionName: "balanceOf", args: [seller1.account.address] });
            const balanceB2After = await seller1.readContract({ address: tokenAddresses[1], abi: tokenABIs[1], functionName: "balanceOf", args: [seller1.account.address] });
            expect(balanceA1After).to.equal(balanceA1Before - parseEther("1"));
            expect(balanceB1After).to.equal(balanceB1Before + parseEther("1"));
            expect(balanceA2After).to.equal(balanceA2Before + parseEther("1"));
            expect(balanceB2After).to.equal(balanceB2Before - parseEther("1"));
        });
    });

    describe("Partial Buy Order", function (){

    });

    describe("Bulk Buy Order", function (){

    });

    describe("Overpay Buy Order", function (){

    });

    describe("Expired Buy Order", function (){

    });

    describe("Cancel Sell Order", function (){

    });
    
    describe("First Bid", function () {
        /*
        let receipt;
      
        beforeAll(async () => {
            const { address, abi } = contract;
            const hash = await buyer1.writeContract({ address, abi, functionName: "bid", value: firstBid });
            receipt = await client.waitForTransactionReceipt({ hash });
            receipts.push({label: "Bidding 1", receipt});
        }); 
        
        it("Should have the right balance", async function () {
            const { address, value } = contract;
            const balance = await client.getBalance({address});
            expect(balance).to.equal(firstBid);
    	}); 
        
        it("Should have emitted an event after bidding", async function () { 
             const { abi } = contract;
            // check the logs looking of events
            expect(receipt.logs).toHaveLength(1);
            const log = receipt.logs[0];
            // parse and check event
            const { args, eventName } = decodeEventLog({abi, data: log.data, topics: log.topics });
            expect(eventName).to.equal('BidPlaced');
            expect(args.bidder).to.equal(buyer1.account.address);
            expect(args.amount).to.equal(firstBid);
        });
      
        it("Should have set the highestBidder", async function () {
              const { address, abi, args } = contract;
              const highestBidder = await client.readContract({ address, abi, functionName: "highestBidder" });
              expect(highestBidder).to.equal(buyer1.account.address);
        });

        it("Should have set the highestBid", async function () {
              const { address, abi, args } = contract;
              const highestBid = await client.readContract({ address, abi, functionName: "highestBid" });
              expect(highestBid).to.equal(firstBid);
        });
        */
    });


    describe("Second Bid", function () {
      /*
      it("Should reject a bid lower than or equal to the current highest bid", async function () {
          const { address, abi } = contract;
          const request = buyer2.writeContract({ address, abi, functionName: "bid", value: firstBid });
          await expect(request).rejects.toThrow("There already is a higher bid.");
      });

      it("Should accept a bid higher than the current highest bid", async function () {
          const { address, abi } = contract;
          const hash = await buyer2.writeContract({ address, abi, functionName: "bid", value: secondBid });
          const receipt = await client.waitForTransactionReceipt({ hash });
          receipts.push({label: "Bidding 2", receipt});
      });
      */
    });
    
    describe("Withdraw", function () {
        /*
        it("Should allow bidders to withdraw their pending returns", async function () {
            const { address, abi } = contract;
            const before = await client.getBalance({ address: buyer1.account.address });
            const hash = await buyer1.writeContract({ address, abi, functionName: "withdraw" });
            const receipt = await client.waitForTransactionReceipt({ hash });
            receipts.push({label: "Withdraw", receipt});
            const gasCost = receipt.gasUsed * receipt.effectiveGasPrice;
            const after = await client.getBalance({ address: buyer1.account.address });
            const netReceived = (after - before) + gasCost;
            expect(netReceived).toBe(firstBid);
        });
        
        it("Should not allow the highest bidder to withdraw", async function () {
            const { address, abi } = contract;
            const request = buyer2.writeContract({ address, abi, functionName: "withdraw" });
            await expect(request).rejects.toThrow("No funds to withdraw.");
        });
        */
    });
    
    describe("End Auction (present)", function () {
        /*
        it("Should not allow to call endAuction before the end", async function () {
            const { address, abi } = contract;
            const request = buyer2.writeContract({ address, abi, functionName: "endAuction" });
            await expect(request).rejects.toThrow("Auction not yet ended.");
        });
        */
    });
    
    describe("End Auction (future)", function () {
        /*
        let before, receipt;
        
        beforeAll(async () => {
            // increase blockchain time by one year
            await client.request({ method: "anvil_increaseTime", params: [biddingTime+1n], });
            // mine 1 block
            await client.request({method: "anvil_mine", params: [1] });
            // endAuction
            const { address, abi } = contract;
            before = await client.getBalance({ address: seller1.account.address });
            const hash = await seller1.writeContract({ address, abi, functionName: "endAuction" });
            receipt = await client.waitForTransactionReceipt({ hash });
            receipts.push({label: "End Auction", receipt});
        })
        
    	it("Should have the ended being true", async function () {
            const { address, abi, args } = contract;
            const ended = await client.readContract({ address, abi, functionName: "ended" });
            expect(ended).to.equal(true);
    	});
        
        it("Should have refunded the seller1", async function () {            
            const gasCost = receipt.gasUsed * receipt.effectiveGasPrice;
            const after = await client.getBalance({ address: seller1.account.address });
            const netReceived = (after - before) + gasCost;
            expect(netReceived).toBe(secondBid);
        });
        
        it("Should have emitted an event", async function () {            
            const { abi } = contract;
           // check the logs looking of events
           expect(receipt.logs).toHaveLength(1);
           const log = receipt.logs[0];
           // parse and check event
           const { args, eventName } = decodeEventLog({abi, data: log.data, topics: log.topics });
           expect(eventName).to.equal('AuctionEnded');
           expect(args.winner).to.equal(buyer2.account.address);
           expect(args.amount).to.equal(secondBid);
        });
        */
    });	
});
