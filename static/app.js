import {
  createPublicClient,
  createWalletClient,
  custom,
  getAddress,
  parseAbiItem
} from "https://esm.sh/viem@2.19.4";
import * as chains from "https://esm.sh/viem@2.19.4/chains";

const PAGE_SIZE = 6;
const ABI_EVENT = parseAbiItem(
  "event OrderPosted(address seller,address tokenA,address tokenB,uint256 amountA,uint256 amountB,uint256 deadline,uint256 nonce,bytes signature)"
);
const ABI_CREATE_ORDER = [
  {
    type: "function",
    name: "createOrder",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "amountA", type: "uint256" },
      { name: "amountB", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "signature", type: "bytes" },
      { name: "postOnChain", type: "bool" }
    ],
    outputs: [{ type: "bool" }]
  }
];
const ABI_FILL_ORDER = [
  {
    type: "function",
    name: "fillOrder",
    stateMutability: "nonpayable",
    inputs: [
      { name: "seller", type: "address" },
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "amountA", type: "uint256" },
      { name: "amountB", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "signature", type: "bytes" },
      { name: "offer", type: "uint256" }
    ],
    outputs: [{ type: "bool" },]
  }
];
const ERC20_ABI = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
];

const connectButton = document.getElementById("connectButton");
const networkSelect = document.getElementById("networkSelect");
const walletStatus = document.getElementById("walletStatus");
const message = document.getElementById("message");
const contractLink = document.getElementById("contractLink");
const contractLinkUrl = document.getElementById("contractLinkUrl");
const orderForm = document.getElementById("orderForm");
const fromToken = document.getElementById("fromToken");
const toToken = document.getElementById("toToken");
const amountA = document.getElementById("amountA");
const amountB = document.getElementById("amountB");
const durationRelative = document.getElementById("durationRelative");
const durationAbsolute = document.getElementById("durationAbsolute");
const txModal = document.getElementById("txModal");
const closeModal = document.getElementById("closeModal");
const txBody = document.getElementById("txBody");

// order browsing/filling UI elements
const ordersGrid = document.getElementById("ordersGrid");
const ordersGridBody = document.getElementById("ordersGridBody");
const ordersPrev = document.getElementById("ordersPrev");
const ordersNext = document.getElementById("ordersNext");
const ordersPageInfo = document.getElementById("ordersPageInfo");
const ordersMessage = document.getElementById("ordersMessage");
const ordersPagination = document.getElementById("ordersPagination");
const ordersRefresh = document.getElementById("ordersRefresh");
const tabsNav = document.querySelector(".tabs-nav");
const tabPanels = document.querySelectorAll(".tab-panel");
const walletGate = document.getElementById("walletGate");

const orderOverviewMessage = document.getElementById("orderOverviewMessage");
const orderOverviewForm = document.getElementById("orderOverviewForm");
const ovSeller = document.getElementById("ovSeller");
const ovTokenA = document.getElementById("ovTokenA");
const ovTokenB = document.getElementById("ovTokenB");
const ovAmountA = document.getElementById("ovAmountA");
const ovAmountB = document.getElementById("ovAmountB");
// deadline inputs in overview: unix + datetime-local
const ovDeadlineUnix = document.getElementById("ovDeadlineUnix");
const ovDeadlineDatetime = document.getElementById("ovDeadlineDatetime");
const ovNonce = document.getElementById("ovNonce");
const ovSignature = document.getElementById("ovSignature");
const ovOffer = document.getElementById("ovOffer");

// -----------------------------------------------------------------------------
// token support for arbitrary ERC‑20s
// -----------------------------------------------------------------------------
// a small registry of popular tokens keyed by chain id, with hard‑coded Sepolia
// addresses taken from the project README.  the user may always enter a custom
// contract by choosing the special "Custom token..." entry in a selector.
const KNOWN_TOKENS = {
  "11155111": [ // Sepolia
    { symbol: "USDT", name: "Tether USD", address: "0x7169D38820dfd117C3FA1F22A697dBA58d90BA06" },
    { symbol: "USDC", name: "USD Coin", address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" },
    { symbol: "DAI",  name: "Dai Stablecoin", address: "0x3e622317f8C93f7328350cF0B56d9eD4C620C5d6" },
    // DeFi governance / utility (addresses not provided in README – placeholders)
    { symbol: "LINK", name: "Chainlink", address: "0x0000000000000000000000000000000000000000" },
    { symbol: "AAVE", name: "Aave", address: "0x0000000000000000000000000000000000000000" },
    { symbol: "MKR",  name: "Maker", address: "0x0000000000000000000000000000000000000000" },
    { symbol: "UNI",  name: "Uniswap", address: "0x0000000000000000000000000000000000000000" }
  ]
};

// populate the <select> controls with known tokens and a custom option
function populateTokenSelects(chainId) {
  const tokens = KNOWN_TOKENS[String(chainId)] || [];
  [fromToken, toToken].forEach((sel) => {
    if (!sel) return;
    sel.innerHTML = "";
    tokens.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.address;
      opt.textContent = `${t.symbol} (${t.address})`;
      sel.appendChild(opt);
    });
    const customOpt = document.createElement("option");
    customOpt.value = "__custom__";
    customOpt.textContent = "Custom token...";
    sel.appendChild(customOpt);
  });
}

// if user selects the "Custom token..." entry prompt for an address and insert it
function handleCustomTokenSelection(event) {
  const sel = event.target;
  if (sel.value !== "__custom__") return;
  const addr = prompt("Enter ERC20 token contract address:");
  if (!addr) {
    sel.value = "";
    return;
  }
  const normalized = addr.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(normalized)) {
    setMessage("Invalid address entered.", "warn");
    sel.value = "";
    return;
  }
  const opt = document.createElement("option");
  opt.value = normalized;
  opt.textContent = `Custom (${formatAddress(normalized)})`;
  opt.selected = true;
  sel.appendChild(opt);
}

// wire up token selectors after DOM is ready
fromToken?.addEventListener("change", handleCustomTokenSelection);
toToken?.addEventListener("change", handleCustomTokenSelection);

// sync overview deadline inputs: datetime-local <-> unix
if (ovDeadlineDatetime && ovDeadlineUnix) {
  ovDeadlineDatetime.addEventListener("change", () => {
    const v = ovDeadlineDatetime.value;
    if (!v) {
      ovDeadlineUnix.value = "";
      return;
    }
    const t = new Date(v);
    if (isNaN(t.getTime())) return;
    ovDeadlineUnix.value = String(Math.floor(t.getTime() / 1000));
  });

  ovDeadlineUnix.addEventListener("input", () => {
    const v = Number(ovDeadlineUnix.value);
    if (!Number.isFinite(v) || v <= 0) {
      ovDeadlineDatetime.value = "";
      return;
    }
    const dt = new Date(v * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    ovDeadlineDatetime.value = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  });
}


// ============================================================================
// TAB SYSTEM
// ============================================================================
/**
 * Initialize tab navigation system.
 * Allows for flexible, extensible tab switching capability.
 * New tabs can be added by:
 * 1. Adding a tab button with class "tab-btn" and data-tab attribute
 * 2. Adding a corresponding section with class "tab-panel" and matching data-tab
 * 3. No JS changes needed
 */
function initializeTabs() {
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabPanels = document.querySelectorAll(".tab-panel");

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tabName = button.getAttribute("data-tab");
      if (!tabName) return;

      // Deactivate all buttons and panels
      tabButtons.forEach((btn) => btn.classList.remove("active"));
      tabPanels.forEach((panel) => panel.classList.remove("active"));

      // Activate clicked button and corresponding panel
      button.classList.add("active");
      const activePanel = document.querySelector(
        `.tab-panel[data-tab="${tabName}"]`
      );
      if (activePanel) {
        activePanel.classList.add("active");
      }
    });
  });
}

// wire up token selectors after DOM is ready
fromToken?.addEventListener("change", handleCustomTokenSelection);
toToken?.addEventListener("change", handleCustomTokenSelection);


let isConnected = false;
let configCache = null;
let walletClient = null;
let publicClient = null;
let currentChainId = null;
let currentAccount = null;
let currentExplorerBase = null;
let orderNonce = 67n;

// browsing / filling orders state
let ordersRows = [];
let ordersTotalPages = 1;
let currentOrdersPage = 1;

function setMessage(text, tone = "info") {
  message.textContent = text;
  message.dataset.tone = tone;
}

function formatAddress(value) {
  if (!value) return "";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatUnixToLocal(unix) {
  try {
    const n = Number(unix);
    if (!Number.isFinite(n) || n <= 0) return "N/A";
    return new Date(n * 1000).toLocaleString();
  } catch (_) {
    return "N/A";
  }
}

function formatNumber(n) {
  try {
    return new Intl.NumberFormat().format(Number(n.toString()));
  } catch (_) {
    return n.toString();
  }
}

function setWalletUiState(connected) {
  if (tabsNav) tabsNav.hidden = !connected;
  tabPanels.forEach((panel) => {
    panel.hidden = !connected;
  });
  if (walletGate) walletGate.hidden = connected;
  if (!connected) {
    contractLink.hidden = true;
  }
}

function resetUi() {
  isConnected = false;
  connectButton.textContent = "Connect Wallet";
  walletStatus.textContent = "";
  setMessage("Please connect your wallet first.");
  currentExplorerBase = null;
  currentAccount = null;
  if (ordersRefresh) ordersRefresh.disabled = true;
  setWalletUiState(false);
}

async function loadConfig() {
  const response = await fetch("config.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Unable to load config.json");
  }
  return response.json();
}

function getChainName(chainId) {
  const id = Number(chainId);
  const entries = Object.values(chains);
  const chain = entries.find((item) => item && item.id === id);
  return chain ? chain.name : null;
}

function getChainById(chainId) {
  const id = Number(chainId);
  const entries = Object.values(chains);
  return entries.find((item) => item && item.id === id) ?? null;
}

function getExplorerBase(chainId) {
  const id = Number(chainId);
  const entries = Object.values(chains);
  const chain = entries.find((item) => item && item.id === id);
  return chain?.blockExplorers?.default?.url ?? null;
}

function populateNetworkSelect(config) {
  networkSelect.innerHTML = "";
  const ids = Object.keys(config);
  if (!ids.length) {
    const option = document.createElement("option");
    option.textContent = "No networks configured";
    option.value = "";
    networkSelect.appendChild(option);
    networkSelect.disabled = true;
    return;
  }
  ids.forEach((id) => {
    const option = document.createElement("option");
    option.value = id;
    const chainName = getChainName(id) ?? `Chain ${id}`;
    option.textContent = chainName;
    networkSelect.appendChild(option);
  });
}

function updateContractLink(chainId, address) {
  if (!chainId || !address) {
    contractLink.hidden = true;
    contractLinkUrl.href = "#";
    contractLinkUrl.textContent = "";
    return;
  }
  const explorerBase = getExplorerBase(chainId);
  if (explorerBase) {
    contractLinkUrl.href = `${explorerBase}/address/${address}`;
    contractLinkUrl.textContent = address;
    contractLink.hidden = false;
  } else {
    contractLink.hidden = true;
  }
}

async function initNetworks() {
  try {
    configCache = await loadConfig();
    populateNetworkSelect(configCache);
    const [firstChainId] = Object.keys(configCache);
    if (firstChainId && configCache[firstChainId]?.address) {
      updateContractLink(Number(firstChainId), configCache[firstChainId].address);
    }
    // pre‑populate token lists for the first network
    if (firstChainId) populateTokenSelects(Number(firstChainId));
  } catch (error) {
    setMessage(`Error: ${error.message}`);
  }
}

function ensureClients() {
  if (!window.ethereum) {
    throw new Error("No wallet detected. Install MetaMask or another provider.");
  }
  if (!walletClient) {
    walletClient = createWalletClient({
      transport: custom(window.ethereum)
    });
  }
  if (!publicClient) {
    publicClient = createPublicClient({
      transport: custom(window.ethereum)
    });
  }
}

async function fetchEvents(contractAddress, fromBlock) {
  return publicClient.getLogs({
    address: getAddress(contractAddress),
    event: ABI_EVENT,
    fromBlock: BigInt(fromBlock),
    toBlock: "latest"
  });
}

// attach block timestamps to logs so we can show human-readable times
async function addTimestampsToLogs(logs) {
  const uniqueBlocks = Array.from(
    new Set(logs.map((l) => l.blockNumber?.toString()).filter(Boolean))
  );
  const blocks = await Promise.all(
    uniqueBlocks.map((bn) => publicClient.getBlock({ blockNumber: BigInt(bn) }))
  );
  const timestampMap = new Map(blocks.map((b) => [b.number.toString(), Number(b.timestamp)]));
  return logs.map((log) => ({ ...log, blockTimestamp: timestampMap.get(log.blockNumber?.toString()) ?? null }));
}

// async function addTimestampsToLogs(logs) {
//   const uniqueBlocks = Array.from(
//     new Set(logs.map((log) => log.blockNumber?.toString()).filter(Boolean))
//   );
//   const blocks = await Promise.all(
//     uniqueBlocks.map((blockNumber) =>
//       publicClient.getBlock({ blockNumber: BigInt(blockNumber) })
//     )
//   );
//   const timestampMap = new Map(
//     blocks.map((block) => [block.number.toString(), Number(block.timestamp)])
//   );
//   return logs.map((log) => ({
//     ...log,
//     timestamp: timestampMap.get(log.blockNumber?.toString()) ?? null
//   }));
// }

// function formatEndDate(timestamp, biddingTime) {
//   if (!timestamp || !biddingTime) return { value: "N/A", endSeconds: null };
//   const endSeconds = Number(timestamp) + Number(biddingTime);
//   const date = new Date(endSeconds * 1000);
//   const year = date.getFullYear();
//   const month = String(date.getMonth() + 1).padStart(2, "0");
//   const day = String(date.getDate()).padStart(2, "0");
//   let hours = date.getHours();
//   const minutes = String(date.getMinutes()).padStart(2, "0");
//   const seconds = String(date.getSeconds()).padStart(2, "0");
//   const period = hours >= 12 ? "PM" : "AM";
//   hours = hours % 12;
//   if (hours === 0) hours = 12;
//   const hourStr = String(hours).padStart(2, "0");
//   return {
//     value: `${year}-${month}-${day} ${hourStr}:${minutes}:${seconds} ${period}`,
//     endSeconds
//   };
// }

async function resolveDeploymentBlock(chainConfig) {
  if (chainConfig.hash) {
    const receipt = await publicClient.getTransactionReceipt({
      hash: chainConfig.hash
    });
    return Number(receipt.blockNumber);
  }
  return Number(chainConfig.deploymentBlock ?? 0);
}

async function estimateGasForContract({
  address,
  abi,
  functionName,
  args = [],
  value
}) {
  const chain = getChainById(currentChainId);
  return publicClient.estimateContractGas({
    account: currentAccount,
    address: getAddress(address),
    abi,
    functionName,
    args,
    value,
    chain: chain ?? undefined
  });
}

// ----- order browsing helpers ------------------------------------------------

function getPageFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const page = Number(params.get("page"));
  if (Number.isNaN(page) || page < 1) return 1;
  return page;
}

function updateUrl(page) {
  const params = new URLSearchParams(window.location.search);
  params.set("page", String(page));
  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.pushState({ page }, "", newUrl);
}

// calculate number of pages based on the global ordersRows array
function computeOrderPagination() {
  ordersTotalPages = Math.max(1, Math.ceil(ordersRows.length / PAGE_SIZE));
  if (currentOrdersPage > ordersTotalPages) currentOrdersPage = ordersTotalPages;
}

function renderOrdersPage(page) {
  computeOrderPagination();
  currentOrdersPage = Math.min(Math.max(1, page), ordersTotalPages);
  const start = (currentOrdersPage - 1) * PAGE_SIZE;
  const slice = ordersRows.slice(start, start + PAGE_SIZE);
  ordersGridBody.innerHTML = slice
    .map((row, idx) => {
      const p = start + idx;
      return `
        <div class="grid-row order-row" data-index="${p}">
          <div title="${row.seller}">${formatAddress(row.seller)}</div>
          <div title="${row.tokenA}">${formatAddress(row.tokenA)}</div>
          <div title="${row.tokenB}">${formatAddress(row.tokenB)}</div>
          <div>${formatNumber(row.amountA)}</div>
          <div>${formatNumber(row.amountB)}</div>
          <div title="${row.deadlineUnix}">${row.deadlineHuman} <small style="color:var(--muted);font-size:12px;display:block">${row.deadlineUnix}</small></div>
        </div>
      `;
    })
    .join("");
  ordersPageInfo.textContent = `Page ${currentOrdersPage} of ${ordersTotalPages}`;
  ordersPrev.disabled = currentOrdersPage <= 1;
  ordersNext.disabled = currentOrdersPage >= ordersTotalPages;
  updateUrl(currentOrdersPage);
}

function loadOrderIntoOverview(order) {
  ovSeller.value = order.seller;
  ovTokenA.value = order.tokenA;
  ovTokenB.value = order.tokenB;
  ovAmountA.value = order.amountA.toString();
  ovAmountB.value = order.amountB.toString();
  // populate both unix and datetime inputs
  const unix = Number(order.deadline?.toString() ?? 0);
  if (ovDeadlineUnix) ovDeadlineUnix.value = String(unix);
  if (ovDeadlineDatetime) {
    // convert to yyyy-MM-ddTHH:mm for datetime-local
    const dt = unix > 0 ? new Date(unix * 1000) : null;
    if (dt) {
      const pad = (n) => String(n).padStart(2, "0");
      const value = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
      ovDeadlineDatetime.value = value;
    } else {
      ovDeadlineDatetime.value = "";
    }
  }
  ovNonce.value = order.nonce.toString();
  ovSignature.value = order.signature;
  ovOffer.value = "";
  orderOverviewMessage.textContent = "Order details populated; you may edit before filling.";
}

async function refreshOrders() {
  if (!isConnected || !configCache || !currentChainId) return;
  const chainConfig = configCache[String(currentChainId)];
  if (!chainConfig || !chainConfig.address) return;
  const deploymentBlock = await resolveDeploymentBlock(chainConfig);
  const logs = await fetchEvents(chainConfig.address, deploymentBlock);
  const logsWithTs = await addTimestampsToLogs(logs);
  // convert logs to simple objects and filter active
  const now = BigInt(Math.floor(Date.now() / 1000));
  ordersRows = logsWithTs
    .map((log) => {
      const args = log.args;
      const deadlineUnix = Number(args.deadline?.toString() ?? 0);
      return {
        blockNumber: log.blockNumber ?? 0n,
        logIndex: Number(log.logIndex ?? 0),
        seller: args.seller,
        tokenA: args.tokenA,
        tokenB: args.tokenB,
        amountA: args.amountA,
        amountB: args.amountB,
        deadline: BigInt(args.deadline ?? 0),
        deadlineUnix,
        deadlineHuman: formatUnixToLocal(deadlineUnix),
        blockTimestamp: log.blockTimestamp ?? null,
        nonce: args.nonce,
        signature: args.signature
      };
    })
    .filter((o) => {
      try {
        return BigInt(o.deadline) > now;
      } catch (_) {
        return false;
      }
    })
    .sort((a, b) => {
      if (a.blockNumber === b.blockNumber) {
        return b.logIndex - a.logIndex;
      }
      return a.blockNumber > b.blockNumber ? -1 : 1;
    });
  if (!ordersRows.length) {
    ordersMessage.textContent = "No active orders posted yet.";
    ordersGridBody.innerHTML = "";
    ordersGrid.hidden = true;
    ordersPagination.hidden = true;
    return;
  }
  ordersMessage.textContent = "";
  ordersGrid.hidden = false;
  computeOrderPagination();
  ordersPagination.hidden = ordersTotalPages <= 1;
  renderOrdersPage(getPageFromUrl());
}


// async function hydrateAuctionState(rows) {
//   const results = await Promise.all(
//     rows.map(async (row) => {
//       try {
//         const [highestBidder, highestBid, pendingReturns] = await Promise.all([
//           publicClient.readContract({
//             address: getAddress(row.auction),
//             abi: ABI_AUCTION_READ,
//             functionName: "highestBidder"
//           }),
//           publicClient.readContract({
//             address: getAddress(row.auction),
//             abi: ABI_AUCTION_READ,
//             functionName: "highestBid"
//           }),
//           currentAccount
//             ? publicClient.readContract({
//                 address: getAddress(row.auction),
//                 abi: ABI_AUCTION_READ,
//                 functionName: "pendingReturns",
//                 args: [currentAccount]
//               })
//             : Promise.resolve(0n)
//         ]);
//         return {
//           ...row,
//           highestBidder,
//           highestBid: highestBid ? formatEther(highestBid) : null,
//           pendingReturns: pendingReturns ?? 0n
//         };
//       } catch (error) {
//         return { ...row, highestBidder: null, highestBid: null, pendingReturns: 0n };
//       }
//     })
//   );
//   return results;
// }

async function connectWallet() {
  if (isConnected) {
    resetUi();
    return;
  }

  try {
    connectButton.disabled = true;
    setMessage("Connecting to wallet...");

    ensureClients();
    const accounts = await walletClient.requestAddresses();
    const address = accounts[0];
    if (!address) {
      setMessage("No account selected.");
      return;
    }
    currentAccount = address;
    walletStatus.textContent = `Connected: ${formatAddress(address)}`;

    const chainId = await walletClient.getChainId();
    currentChainId = chainId;
    currentExplorerBase = getExplorerBase(chainId);

    if (!configCache) {
      configCache = await loadConfig();
      populateNetworkSelect(configCache);
    }
    networkSelect.value = String(chainId);
    // refresh tokens for connected chain
    populateTokenSelects(chainId);

    const chainConfig = configCache[String(chainId)];
    if (!chainConfig || !chainConfig.address) {
      setMessage("This app has not been deployed on the connected chain.");
      contractLink.hidden = true;
      orderForm.hidden = true;
      isConnected = true;
      connectButton.textContent = "Disconnect Wallet";
      setWalletUiState(true);
      return;
    }

    updateContractLink(chainId, chainConfig.address);
    orderForm.hidden = false;
    setMessage("Ready to create an order.");
    isConnected = true;
    connectButton.textContent = "Disconnect Wallet";
    if (ordersRefresh) ordersRefresh.disabled = false;
    setWalletUiState(true);
    // load orders for browsing
    refreshOrders();
  } catch (error) {
    setMessage(`Error: ${error.message}`);
  } finally {
    connectButton.disabled = false;
  }
}

function getPostOnChain() {
  const value = document.querySelector('input[name="postOnChain"]:checked')?.value;
  return value === "yes"; // "yes" is checked for "Yes pls"
}

function calculateDeadline() {
  const type = document.querySelector('input[name="durationType"]:checked')?.value;
  const now = Math.floor(Date.now() / 1000);
  
  if (type === "relative") {
    const hours = Number(durationRelative.value);
    if (!Number.isFinite(hours) || hours <= 0) {
      throw new Error("Duration must be a positive number.");
    }
    return BigInt(now + hours * 3600);
  } else {
    const dateStr = durationAbsolute.value;
    if (!dateStr) {
      throw new Error("Please select a date and time.");
    }
    const deadline = Math.floor(new Date(dateStr).getTime() / 1000);
    if (deadline <= now) {
      throw new Error("Deadline must be in the future.");
    }
    return BigInt(deadline);
  }
}

async function signOrderWithEIP712(
  tokenA,
  tokenB,
  amountA,
  amountB,
  deadline,
  nonce
) {
  if (!walletClient || !currentAccount || !currentChainId) {
    throw new Error("Wallet not connected.");
  }

  const chain = getChainById(currentChainId);
  if (!chain) {
    throw new Error("Chain not found.");
  }

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
      chainId: currentChainId,
      verifyingContract: getAddress("0xCE447D412Fc82c2A1Be9FFD055391c521f4401C2")
    },
    message: {
      seller: currentAccount,
      tokenA: getAddress(tokenA),
      tokenB: getAddress(tokenB),
      amountA: amountA.toString(),
      amountB: amountB.toString(),
      deadline: deadline.toString(),
      nonce: nonce.toString()
    }
  };

  console.log(`seller: ${typedData.message.seller}`);
  console.log(`tokenA: ${typedData.message.tokenA}`);
  console.log(`tokenB: ${typedData.message.tokenB}`);
  console.log(`amountA: ${typedData.message.amountA}`);
  console.log(`amountB: ${typedData.message.amountB}`);
  console.log(`deadline: ${typedData.message.deadline}`);
  console.log(`nonce: ${typedData.message.nonce}`);

  try {
    // Use the wallet provider's eth_signTypedData_v4
    const signature = await window.ethereum.request({
      method: "eth_signTypedData_v4",
      params: [currentAccount, JSON.stringify(typedData)]
    });
    return signature;
  } catch (error) {
    throw new Error(`EIP-712 signing failed: ${error.message}`);
  }
}

// async function refreshAuctions() {
//   if (!isConnected || !configCache || !currentChainId) return;
//   const chainConfig = configCache[String(currentChainId)];
//   if (!chainConfig || !chainConfig.address) return;
//   const deploymentBlock = await resolveDeploymentBlock(chainConfig);
//   const logs = await fetchEvents(chainConfig.address, deploymentBlock);
//   const logsWithTimestamps = await addTimestampsToLogs(logs);
//   allRows = logsWithTimestamps.map((log) => {
//     const endInfo = formatEndDate(log.timestamp, log.args.biddingTime);
//     return {
//       auction: log.args.auction,
//       owner: log.args.owner,
//       label: log.args.label,
//       endDate: endInfo.value,
//       endSeconds: endInfo.endSeconds
//     };
//   });
//   allRows = await hydrateAuctionState(allRows);
//   if (!allRows.length) {
//     setMessage("No auctions have been deployed yet.");
//     grid.hidden = true;
//     pagination.hidden = true;
//     return;
//   }
//   totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
//   pagination.hidden = totalPages <= 1;
//   grid.hidden = false;
//   renderPage(getPageFromUrl());
// }

// prevPage.addEventListener("click", () => {
//   const current = getPageFromUrl();
//   renderPage(current - 1);
// });

// nextPage.addEventListener("click", () => {
//   const current = getPageFromUrl();
//   renderPage(current + 1);
// });

// networkSelect.addEventListener("change", async (event) => {
//   if (!window.ethereum) {
//     setMessage("No wallet detected. Install MetaMask or another provider.", "warn");
//     return;
//   }
//   const chainId = event.target.value;
//   if (!chainId) return;
//   try {
//     await walletClient.switchChain({
//       id: Number(chainId)
//     });
//   } catch (error) {
//     if (error && error.code === 4902) {
//       setMessage("This network is not available in your wallet.");
//       return;
//     }
//     setMessage(`Error: ${error.message}`);
//   }
// });

// createAuctionButton.addEventListener("click", () => {
//   if (!isConnected) {
//     setMessage("Connect your wallet to create an auction.");
//     return;
//   }
//   grid.hidden = true;
//   pagination.hidden = true;
//   auctionForm.reset();
//   auctionModal.hidden = false;
// });

// refreshButton.addEventListener("click", async () => {
//   if (!isConnected) {
//     setMessage("Connect your wallet to refresh auctions.");
//     return;
//   }
//   setMessage("Refreshing auctions...");
//   await refreshAuctions();
// });

// cancelForm.addEventListener("click", () => {
//   auctionModal.hidden = true;
//   grid.hidden = !allRows.length;
//   pagination.hidden = totalPages <= 1;
// });

// closeAuctionModal.addEventListener("click", () => {
//   auctionModal.hidden = true;
//   grid.hidden = !allRows.length;
//   pagination.hidden = totalPages <= 1;
// });

// auctionForm.addEventListener("submit", async (event) => {
//   event.preventDefault();
//   if (!isConnected || !configCache || !currentChainId) return;
//   const chainConfig = configCache[String(currentChainId)];
//   if (!chainConfig || !chainConfig.address) {
//     setMessage("This app has not been deployed on the connected chain.");
//     return;
//   }

//   const label = auctionLabel.value.trim();
//   const durationDays = Number(auctionDuration.value);
//   if (!label) {
//     setMessage("Label is required.");
//     return;
//   }
//   if (!Number.isFinite(durationDays) || durationDays <= 0) {
//     setMessage("Duration must be a positive number of days.");
//     return;
//   }

//   try {
//     setMessage("Submitting transaction...");
//     const biddingTime = BigInt(Math.floor(durationDays * 24 * 60 * 60));
//     const chain = getChainById(currentChainId);
//     const hash = await walletClient.writeContract({
//       account: currentAccount,
//       address: getAddress(chainConfig.address),
//       abi: ABI_CREATE,
//       functionName: "createAuction",
//       args: [label, biddingTime],
//       chain: chain ?? undefined,
//       gas: await estimateGasForContract({
//         address: chainConfig.address,
//         abi: ABI_CREATE,
//         functionName: "createAuction",
//         args: [label, biddingTime]
//       })
//     });

//     const explorer = getExplorerBase(currentChainId);
//     const link = explorer ? `${explorer}/tx/${hash}` : null;

//     const shortHash = `${hash.slice(0, 6)}...${hash.slice(-4)}`;
//     txBody.innerHTML = link
//       ? `Transaction confirmed. Hash: <a href="${link}" target="_blank" rel="noreferrer">${shortHash}</a>`
//       : `Transaction confirmed. Hash: ${shortHash}`;
//     txModal.hidden = false;

//     auctionForm.reset();
//     auctionModal.hidden = true;
//   } catch (error) {
//     setMessage(`Error: ${error.message}`);
//   }
// });

// closeModal.addEventListener("click", async () => {
//   txModal.hidden = true;
//   await refreshAuctions();
// });

// closeBidModal.addEventListener("click", () => {
//   bidModal.hidden = true;
//   currentBidAuction = null;
// });

// gridBody.addEventListener("click", (event) => {
//   const button = event.target.closest(".bid-btn");
//   if (!button) return;
//   const auction = button.getAttribute("data-auction");
//   if (!auction) return;
//   currentBidAuction = auction;
//   bidForm.reset();
//   bidModal.hidden = false;
// });

// bidForm.addEventListener("submit", async (event) => {
//   event.preventDefault();
//   if (!currentBidAuction || !currentAccount) return;
//   const valueEth = bidValue.value.trim();
//   if (!valueEth || Number(valueEth) <= 0) {
//     setMessage("Bid value must be greater than 0.");
//     return;
//   }
//   try {
//     setMessage("Submitting bid...");
//     const chain = getChainById(currentChainId);
//     const hash = await walletClient.writeContract({
//       account: currentAccount,
//       address: getAddress(currentBidAuction),
//       abi: ABI_AUCTION_BID,
//       functionName: "bid",
//       value: parseEther(valueEth),
//       chain: chain ?? undefined,
//       gas: await estimateGasForContract({
//         address: currentBidAuction,
//         abi: ABI_AUCTION_BID,
//         functionName: "bid",
//         value: parseEther(valueEth)
//       })
//     });
//     const link = currentExplorerBase
//       ? `${currentExplorerBase}/tx/${hash}`
//       : null;
//     const shortHash = `${hash.slice(0, 6)}...${hash.slice(-4)}`;
//     txBody.innerHTML = link
//       ? `Transaction confirmed. Hash: <a href="${link}" target="_blank" rel="noreferrer">${shortHash}</a>`
//       : `Transaction confirmed. Hash: ${shortHash}`;
//     txModal.hidden = false;
//     bidModal.hidden = true;
//     currentBidAuction = null;
//     await refreshAuctions();
//   } catch (error) {
//     setMessage(`Error: ${error.message}`);
//   }
// });

// gridBody.addEventListener("click", async (event) => {
//   const withdraw = event.target.closest(".withdraw-btn");
//   const end = event.target.closest(".end-btn");
//   if (!withdraw && !end) return;
//   const auction = (withdraw ?? end).getAttribute("data-auction");
//   if (!auction || !currentAccount) return;
//   try {
//     const chain = getChainById(currentChainId);
//     if (withdraw) {
//       setMessage("Submitting withdraw...");
//       const hash = await walletClient.writeContract({
//         account: currentAccount,
//         address: getAddress(auction),
//         abi: ABI_AUCTION_WITHDRAW,
//         functionName: "withdraw",
//         chain: chain ?? undefined,
//         gas: await estimateGasForContract({
//           address: auction,
//           abi: ABI_AUCTION_WITHDRAW,
//           functionName: "withdraw"
//         })
//       });
//       const link = currentExplorerBase
//         ? `${currentExplorerBase}/tx/${hash}`
//         : null;
//       const shortHash = `${hash.slice(0, 6)}...${hash.slice(-4)}`;
//       txBody.innerHTML = link
//         ? `Transaction confirmed. Hash: <a href="${link}" target="_blank" rel="noreferrer">${shortHash}</a>`
//         : `Transaction confirmed. Hash: ${shortHash}`;
//       txModal.hidden = false;
//       await refreshAuctions();
//       return;
//     }
//     if (end) {
//       setMessage("Ending auction...");
//       const hash = await walletClient.writeContract({
//         account: currentAccount,
//         address: getAddress(auction),
//         abi: ABI_AUCTION_END,
//         functionName: "endAuction",
//         chain: chain ?? undefined,
//         gas: await estimateGasForContract({
//           address: auction,
//           abi: ABI_AUCTION_END,
//           functionName: "endAuction"
//         })
//       });
//       const link = currentExplorerBase
//         ? `${currentExplorerBase}/tx/${hash}`
//         : null;
//       const shortHash = `${hash.slice(0, 6)}...${hash.slice(-4)}`;
//       txBody.innerHTML = link
//         ? `Transaction confirmed. Hash: <a href="${link}" target="_blank" rel="noreferrer">${shortHash}</a>`
//         : `Transaction confirmed. Hash: ${shortHash}`;
//       txModal.hidden = false;
//       await refreshAuctions();
//     }
//   } catch (error) {
//     setMessage(`Error: ${error.message}`);
//   }
// });

// duration toggle helper
function updateDurationInputs() {
  const type = document.querySelector('input[name="durationType"]:checked')?.value;
  if (type === "relative") {
    durationRelative.style.display = "";
    durationAbsolute.style.display = "none";
  } else {
    durationRelative.style.display = "none";
    durationAbsolute.style.display = "";
  }
}

document.querySelectorAll('input[name="durationType"]').forEach((r) => {
  r.addEventListener("change", updateDurationInputs);
});
updateDurationInputs();

networkSelect.addEventListener("change", async (event) => {
  if (!window.ethereum) {
    setMessage("No wallet detected. Install MetaMask or another provider.", "warn");
    return;
  }
  const chainId = event.target.value;
  if (!chainId) return;
  try {
    await walletClient.switchChain({
      id: Number(chainId)
    });
  } catch (error) {
    if (error && error.code === 4902) {
      setMessage("This network is not available in your wallet.");
      return;
    }
    setMessage(`Error: ${error.message}`);
  } finally {
    // always refresh available tokens for the newly selected network
    populateTokenSelects(Number(chainId));
    // and reload orders on new chain
    refreshOrders();
  }
});

orderForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!isConnected || !configCache || !currentChainId || !currentAccount) {
    setMessage("Connect your wallet first.");
    return;
  }

  const chainConfig = configCache[String(currentChainId)];
  if (!chainConfig || !chainConfig.address) {
    setMessage("This app has not been deployed on the connected chain.");
    return;
  }

  const tokenAAddr = fromToken.value?.trim();
  const tokenBAddr = toToken.value?.trim();
  const amountAVal = amountA.value?.trim();
  const amountBVal = amountB.value?.trim();

  if (!tokenAAddr || !tokenBAddr || !amountAVal || !amountBVal) {
    setMessage("Please fill in all token and amount fields.");
    return;
  }

  try {
    setMessage("Validating order details...");

    const parsedAmountA = BigInt(Math.floor(Number(amountAVal)));
    const parsedAmountB = BigInt(Math.floor(Number(amountBVal)));

    if (parsedAmountA <= 0n || parsedAmountB <= 0n) {
      setMessage("Amounts must be greater than 0.");
      return;
    }

    const deadline = calculateDeadline();
    const postOnChain = getPostOnChain();

    // Increment nonce for each order
    const nonce = orderNonce;
    orderNonce += 1n;

    // ensure the exchange contract is approved to transfer tokenA on behalf of user
    const chain = getChainById(currentChainId);
    const spender = getAddress(chainConfig.address);
    // fetch current allowance
    const currentAllowance = await publicClient.readContract({
      address: getAddress(tokenAAddr),
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [currentAccount, spender]
    });
    if (currentAllowance < parsedAmountA) {
      setMessage("Approving token transfer for order...");
      try {
        const approveHash = await walletClient.writeContract({
          account: currentAccount,
          address: getAddress(tokenAAddr),
          abi: ERC20_ABI,
          functionName: "approve",
          args: [spender, parsedAmountA],
          chain: chain ?? undefined,
          gas: await estimateGasForContract({
            address: tokenAAddr,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [spender, parsedAmountA],
            chain: chain ?? undefined
          })
        });
        const explorer = getExplorerBase(currentChainId);
        const link = explorer ? `${explorer}/tx/${approveHash}` : null;
        setMessage(link
          ? `Approval sent; tx <a href="${link}" target="_blank" rel="noreferrer">${approveHash.slice(0,6)}...${approveHash.slice(-4)}</a>. Submitting order...`
          : "Approval transaction sent. Submitting order...");
      } catch (error) {
        throw new Error(`Approval failed: ${error.message}`);
      }
    }

    setMessage("Signing order with your wallet (EIP-712)...");

    const signature = await signOrderWithEIP712(
      tokenAAddr,
      tokenBAddr,
      parsedAmountA,
      parsedAmountB,
      deadline,
      nonce
    );

    setMessage("Submitting transaction...");

    const hash = await walletClient.writeContract({
      account: currentAccount,
      address: getAddress(chainConfig.address),
      abi: ABI_CREATE_ORDER,
      functionName: "createOrder",
      args: [
        getAddress(tokenAAddr),
        getAddress(tokenBAddr),
        parsedAmountA,
        parsedAmountB,
        deadline,
        nonce,
        signature,
        postOnChain
      ],
      chain: chain ?? undefined,
      gas: await estimateGasForContract({
        address: chainConfig.address,
        abi: ABI_CREATE_ORDER,
        functionName: "createOrder",
        args: [
          getAddress(tokenAAddr),
          getAddress(tokenBAddr),
          parsedAmountA,
          parsedAmountB,
          deadline,
          nonce,
          signature,
          postOnChain
        ]
      })
    });

    const link = currentExplorerBase
      ? `${currentExplorerBase}/tx/${hash}`
      : null;

    const shortHash = `${hash.slice(0, 6)}...${hash.slice(-4)}`;
    // show confirmation plus order details within modal body
    let bodyHtml = link
      ? `Order created successfully!<br />Hash: <a href="${link}" target="_blank" rel="noreferrer">${shortHash}</a>`
      : `Order created successfully!<br />Hash: ${shortHash}`;
    bodyHtml += `<pre class="modal-body">` +
      `Seller: ${currentAccount}\n` +
      `Token A: ${tokenAAddr}\n` +
      `Token B: ${tokenBAddr}\n` +
      `AmountA: ${parsedAmountA.toString()}\n` +
      `AmountB: ${parsedAmountB.toString()}\n` +
      `Deadline: ${deadline.toString()}\n` +
      `Nonce: ${nonce.toString()}\n` +
      `Signature: ${signature}` +
      `</pre>`;
    txBody.innerHTML = bodyHtml;
    txModal.hidden = false;

    orderForm.reset();
    updateDurationInputs();
  } catch (error) {
    setMessage(`Error: ${error.message}`);
  }
});

// pagination controls for orders
ordersPrev?.addEventListener("click", () => {
  const current = getPageFromUrl();
  renderOrdersPage(current - 1);
});
ordersNext?.addEventListener("click", () => {
  const current = getPageFromUrl();
  renderOrdersPage(current + 1);
});
ordersRefresh?.addEventListener("click", () => {
  setMessage("Refreshing orders...");
  refreshOrders();
});

// click a row to populate overview
ordersGridBody?.addEventListener("click", (event) => {
  const row = event.target.closest(".order-row");
  if (!row) return;
  const idx = Number(row.dataset.index);
  const ord = ordersRows[idx];
  if (ord) loadOrderIntoOverview(ord);
});

orderOverviewForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isConnected || !configCache || !currentChainId || !currentAccount) {
    orderOverviewMessage.textContent = "Connect wallet first.";
    return;
  }
  try {
    orderOverviewMessage.textContent = "Submitting fill transaction...";
    const seller = ovSeller.value.trim();
    const tokenA = ovTokenA.value.trim();
    const tokenB = ovTokenB.value.trim();
    const amountAVal = BigInt(ovAmountA.value.trim() || 0);
    const amountBVal = BigInt(ovAmountB.value.trim() || 0);
    const deadline = BigInt((ovDeadlineUnix?.value || "").trim() || 0);
    const nonce = BigInt(ovNonce.value.trim() || 0);
    const signature = ovSignature.value.trim();
    const offer = BigInt(ovOffer.value.trim() || 0);
    if (!seller || !tokenA || !tokenB || !signature || offer <= 0n) {
      orderOverviewMessage.textContent = "Please supply all required fields and an offer > 0.";
      return;
    }

    const chain = getChainById(currentChainId);
    const spender = getAddress(configCache[String(currentChainId)].address);
    const currentAllowance = await publicClient.readContract({
      address: getAddress(tokenB),
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [currentAccount, spender]
    });

    if (currentAllowance < amountBVal) {
      orderOverviewMessage.textContent = "Approving token transfer for fill order...";
      try {
        const approveHash = await walletClient.writeContract({
          account: currentAccount,
          address: getAddress(tokenB),
          abi: ERC20_ABI,
          functionName: "approve",
          args: [spender, amountBVal],
          chain: chain ?? undefined,
          gas: await estimateGasForContract({
            address: tokenB,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [spender, amountBVal]
          })
        });
        const explorer = getExplorerBase(currentChainId);
        const link = explorer ? `${explorer}/tx/${approveHash}` : null;
        orderOverviewMessage.innerHTML = link
          ? `Approval sent; tx <a href="${link}" target="_blank" rel="noreferrer">${approveHash.slice(0,6)}...${approveHash.slice(-4)}</a>. Submitting fill...`
          : "Approval transaction sent. Submitting fill...";
      } catch (error) {
        throw new Error(`Approval failed: ${error.message}`);
      }
    }

    orderOverviewMessage.textContent = "Submitting fill transaction...";
    const hash = await walletClient.writeContract({
      account: currentAccount,
      address: getAddress(configCache[String(currentChainId)].address),
      abi: ABI_FILL_ORDER,
      functionName: "fillOrder",
      args: [seller, tokenA, tokenB, amountAVal, amountBVal, deadline, nonce, signature, offer],
      chain: chain ?? undefined,
      gas: await estimateGasForContract({
        address: configCache[String(currentChainId)].address,
        abi: ABI_FILL_ORDER,
        functionName: "fillOrder",
        args: [seller, tokenA, tokenB, amountAVal, amountBVal, deadline, nonce, signature, offer]
      })
    });
    const explorer = getExplorerBase(currentChainId);
    const link = explorer ? `${explorer}/tx/${hash}` : null;
    const shortHash = `${hash.slice(0, 6)}...${hash.slice(-4)}`;
    txBody.innerHTML = link
      ? `Transaction confirmed. Hash: <a href="${link}" target="_blank" rel="noreferrer">${shortHash}</a>`
      : `Transaction confirmed. Hash: ${shortHash}`;
    txModal.hidden = false;
    orderOverviewMessage.textContent = "";
  } catch (err) {
    orderOverviewMessage.textContent = `Error: ${err.message}`;
  }
});

closeModal.addEventListener("click", () => {
  txModal.hidden = true;
  // refresh orders (and auctions if used)
  refreshOrders();
});

connectButton.addEventListener("click", connectWallet);

if (window.ethereum) {
  window.ethereum.on("accountsChanged", (accounts) => {
    // reset any cached orders when the user swaps accounts
    ordersRows = [];
    ordersGridBody.innerHTML = "";
    ordersMessage.textContent = "";
    if (!accounts || accounts.length === 0) {
      resetUi();
    } else if (isConnected) {
      resetUi();
      connectWallet();
    }
  });

  window.ethereum.on("chainChanged", () => {
    // clear orders and reset UI when the network flips
    ordersRows = [];
    ordersGridBody.innerHTML = "";
    ordersMessage.textContent = "";
    if (isConnected) {
      resetUi();
      connectWallet();
    }
  });
}

txModal.hidden = true;
initializeTabs();
initNetworks();
resetUi();
