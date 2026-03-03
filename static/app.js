/*
 * Winter 2026 CSCD21 Assignment 2:
 * Sell-Only Limit-Order Exchange
 * 
 * Julian Liu, Eddy Chen
 * 
 * This frontend code was built with AI assistance.
 */

import {
  createPublicClient,
  createWalletClient,
  custom,
  getAddress,
  parseAbiItem,
  parseEther,
  parseUnits,
  formatUnits
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
const ABI_IS_FILLABLE = [
  {
    type: "function",
    name: "isFillable",
    stateMutability: "view",
    inputs: [
      { name: "seller", type: "address" },
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "amountA", type: "uint256" },
      { name: "amountB", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "signature", type: "bytes" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
];
const ERC20_ABI = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }]
  },
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
const marketMessage = document.getElementById("marketMessage");
const marketForm = document.getElementById("marketForm");
const marketTokenA = document.getElementById("marketTokenA");
const marketTokenB = document.getElementById("marketTokenB");
const marketOffer = document.getElementById("marketOffer");

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
  [fromToken, toToken, marketTokenA, marketTokenB].forEach((sel) => {
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
marketTokenA?.addEventListener("change", handleCustomTokenSelection);
marketTokenB?.addEventListener("change", handleCustomTokenSelection);

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

      if (tabName === "browse" && orderOverviewMessage) {
        orderOverviewMessage.textContent = "Manually input order details below, or select a published order on the left.";
      }

      if (tabName === "browse" || tabName === "market") {
        refreshOrders();
      }
    });
  });
}

let isConnected = false;
let configCache = null;
let walletClient = null;
let publicClient = null;
let currentChainId = null;
let currentAccount = null;
let currentExplorerBase = null;
let orderNonce = 67n;
const tokenDecimalsCache = new Map();

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

function setMarketMessage(text) {
  if (!marketMessage) return;
  marketMessage.textContent = text;
}

function getUiErrorMessage(error) {
  if (!error) return "Unknown error";
  if (typeof error.shortMessage === "string" && error.shortMessage.trim()) {
    return error.shortMessage.trim();
  }
  if (typeof error.message === "string" && error.message.trim()) {
    return error.message.split("\n")[0].trim();
  }
  return String(error);
}

function logDetailedError(context, error) {
  console.error(`[${context}]`, error);
  if (error?.message) {
    console.error(`[${context}] full message:`, error.message);
  }
}

function formatAmountForDisplay(baseUnits, decimals) {
  try {
    return formatUnits(BigInt(baseUnits), decimals);
  } catch (_) {
    return baseUnits?.toString?.() ?? String(baseUnits);
  }
}

async function getTokenDecimals(tokenAddress) {
  if (!tokenAddress) return 18;
  const cacheKey = `${String(currentChainId)}:${tokenAddress.toLowerCase()}`;
  if (tokenDecimalsCache.has(cacheKey)) {
    return tokenDecimalsCache.get(cacheKey);
  }
  try {
    const decimals = Number(
      await publicClient.readContract({
        address: getAddress(tokenAddress),
        abi: ERC20_ABI,
        functionName: "decimals",
        args: []
      })
    );
    const normalized = Number.isInteger(decimals) && decimals >= 0 ? decimals : 18;
    tokenDecimalsCache.set(cacheKey, normalized);
    return normalized;
  } catch (_) {
    tokenDecimalsCache.set(cacheKey, 18);
    return 18;
  }
}

async function parseTokenAmountInput(rawValue, tokenAddress) {
  const value = (rawValue ?? "").trim();
  if (!value) {
    throw new Error("Amount is required.");
  }
  const decimals = await getTokenDecimals(tokenAddress);
  try {
    if (decimals === 18) {
      return parseEther(value);
    }
    return parseUnits(value, decimals);
  } catch (_) {
    throw new Error(`Invalid token amount: \"${value}\"`);
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
    logDetailedError("initNetworks", error);
    setMessage(`Error: ${getUiErrorMessage(error)}`);
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

async function ensureTokenApproval({
  tokenAddress,
  spender,
  requiredAmount,
  chain,
  statusText,
  statusHtml
}) {
  const token = getAddress(tokenAddress);
  const targetSpender = getAddress(spender);
  const allowance = await publicClient.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [currentAccount, targetSpender]
  });

  if (allowance >= requiredAmount) {
    return;
  }

  const setStatusText = (msg) => {
    if (typeof statusText === "function") statusText(msg);
  };
  const setStatusHtml = (msg) => {
    if (typeof statusHtml === "function") {
      statusHtml(msg);
    } else {
      setStatusText(msg.replace(/<[^>]*>/g, ""));
    }
  };

  if (allowance > 0n) {
    setStatusText("Resetting token allowance to 0...");
    const resetHash = await walletClient.writeContract({
      account: currentAccount,
      address: token,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [targetSpender, 0n],
      chain: chain ?? undefined,
      gas: await estimateGasForContract({
        address: token,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [targetSpender, 0n]
      })
    });

    const explorer = getExplorerBase(currentChainId);
    setStatusHtml(
      explorer
        ? `Allowance reset tx sent: <a href="${explorer}/tx/${resetHash}" target="_blank" rel="noreferrer">${resetHash.slice(0, 6)}...${resetHash.slice(-4)}</a>. Waiting for confirmation...`
        : "Allowance reset transaction sent. Waiting for confirmation..."
    );
    await publicClient.waitForTransactionReceipt({ hash: resetHash });
  }

  setStatusText("Approving token transfer amount...");
  const approveHash = await walletClient.writeContract({
    account: currentAccount,
    address: token,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [targetSpender, requiredAmount],
    chain: chain ?? undefined,
    gas: await estimateGasForContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [targetSpender, requiredAmount]
    })
  });

  const explorer = getExplorerBase(currentChainId);
  setStatusHtml(
    explorer
      ? `Approval tx sent: <a href="${explorer}/tx/${approveHash}" target="_blank" rel="noreferrer">${approveHash.slice(0, 6)}...${approveHash.slice(-4)}</a>. Waiting for confirmation...`
      : "Approval transaction sent. Waiting for confirmation..."
  );
  await publicClient.waitForTransactionReceipt({ hash: approveHash });
}

async function isOrderFillableOnChain(contractAddress, order) {
  try {
    const fillable = await publicClient.readContract({
      address: getAddress(contractAddress),
      abi: ABI_IS_FILLABLE,
      functionName: "isFillable",
      args: [
        order.seller,
        order.tokenA,
        order.tokenB,
        order.amountA,
        order.amountB,
        order.deadline,
        order.nonce,
        order.signature
      ]
    });
    return fillable === true;
  } catch (error) {
    logDetailedError("isFillable", error);
    return false;
  }
}

function computeExpectedOutput(offer, amountA, amountB) {
  if (amountB <= 0n) return 0n;
  return (offer * amountA) / amountB;
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
          <div title="raw: ${row.amountA.toString()}">${row.amountAHuman}</div>
          <div title="raw: ${row.amountB.toString()}">${row.amountBHuman}</div>
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

async function loadOrderIntoOverview(order) {
  const tokenADecimals = await getTokenDecimals(order.tokenA);
  const tokenBDecimals = await getTokenDecimals(order.tokenB);
  ovSeller.value = order.seller;
  ovTokenA.value = order.tokenA;
  ovTokenB.value = order.tokenB;
  ovAmountA.value = formatAmountForDisplay(order.amountA, tokenADecimals);
  ovAmountB.value = formatAmountForDisplay(order.amountB, tokenBDecimals);
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

  if (ordersMessage) {
    ordersMessage.textContent = "Refreshing orders...";
  }

  const deploymentBlock = await resolveDeploymentBlock(chainConfig);
  const logs = await fetchEvents(chainConfig.address, deploymentBlock);
  const logsWithTs = await addTimestampsToLogs(logs);
  // convert logs to simple objects and filter active
  const now = BigInt(Math.floor(Date.now() / 1000));
  const rows = logsWithTs
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
    });

  const uniqueTokenAddresses = Array.from(
    new Set(
      rows
        .flatMap((row) => [row.tokenA, row.tokenB])
        .filter(Boolean)
        .map((addr) => addr.toLowerCase())
    )
  );
  await Promise.all(uniqueTokenAddresses.map((addr) => getTokenDecimals(addr)));

  ordersRows = rows
    .map((row) => {
      const tokenADecimals = tokenDecimalsCache.get(`${String(currentChainId)}:${row.tokenA.toLowerCase()}`) ?? 18;
      const tokenBDecimals = tokenDecimalsCache.get(`${String(currentChainId)}:${row.tokenB.toLowerCase()}`) ?? 18;
      return {
        ...row,
        amountAHuman: formatAmountForDisplay(row.amountA, tokenADecimals),
        amountBHuman: formatAmountForDisplay(row.amountB, tokenBDecimals)
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

  const fillableFlags = await Promise.all(
    ordersRows.map((order) => isOrderFillableOnChain(chainConfig.address, order))
  );
  ordersRows = ordersRows.filter((_, idx) => fillableFlags[idx]);

  if (!ordersRows.length) {
    ordersMessage.textContent = "Orders refreshed.";
    ordersGridBody.innerHTML = "";
    ordersGrid.hidden = true;
    ordersPagination.hidden = true;
    return;
  }
  ordersMessage.textContent = "Orders refreshed.";
  ordersGrid.hidden = false;
  computeOrderPagination();
  ordersPagination.hidden = ordersTotalPages <= 1;
  renderOrdersPage(getPageFromUrl());
}

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
    logDetailedError("connectWallet", error);
    setMessage(`Error: ${getUiErrorMessage(error)}`);
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

  const chainConfig = configCache?.[String(currentChainId)];
  if (!chainConfig?.address) {
    throw new Error("This app has not been deployed on the connected chain.");
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
      verifyingContract: getAddress(chainConfig.address)
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
    logDetailedError("switchChain", error);
    setMessage(`Error: ${getUiErrorMessage(error)}`);
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

    const parsedAmountA = await parseTokenAmountInput(amountAVal, tokenAAddr);
    const parsedAmountB = await parseTokenAmountInput(amountBVal, tokenBAddr);

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
    try {
      await ensureTokenApproval({
        tokenAddress: tokenAAddr,
        spender,
        requiredAmount: parsedAmountA,
        chain,
        statusText: (text) => setMessage(text)
      });
    } catch (error) {
      throw new Error(`Approval failed: ${error.message}`);
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
    logDetailedError("createOrder", error);
    setMessage(`Error: ${getUiErrorMessage(error)}`);
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
ordersGridBody?.addEventListener("click", async (event) => {
  const row = event.target.closest(".order-row");
  if (!row) return;
  const idx = Number(row.dataset.index);
  const ord = ordersRows[idx];
  if (ord) await loadOrderIntoOverview(ord);
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
    const amountAVal = await parseTokenAmountInput(ovAmountA.value, tokenA);
    const amountBVal = await parseTokenAmountInput(ovAmountB.value, tokenB);
    const deadline = BigInt((ovDeadlineUnix?.value || "").trim() || 0);
    const nonce = BigInt(ovNonce.value.trim() || 0);
    const signature = ovSignature.value.trim();
    const offer = await parseTokenAmountInput(ovOffer.value, tokenB);
    if (!seller || !tokenA || !tokenB || !signature || offer <= 0n) {
      orderOverviewMessage.textContent = "Please supply all required fields and an offer > 0.";
      return;
    }

    const chain = getChainById(currentChainId);
    const spender = getAddress(configCache[String(currentChainId)].address);

    try {
      await ensureTokenApproval({
        tokenAddress: tokenB,
        spender,
        requiredAmount: offer,
        chain,
        statusText: (text) => {
          orderOverviewMessage.textContent = text;
        },
        statusHtml: (html) => {
          orderOverviewMessage.innerHTML = html;
        }
      });
    } catch (error) {
      throw new Error(`Approval failed: ${error.message}`);
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
    logDetailedError("fillOrder", err);
    orderOverviewMessage.textContent = `Error: ${getUiErrorMessage(err)}`;
  }
});

marketForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isConnected || !configCache || !currentChainId || !currentAccount) {
    setMarketMessage("Connect wallet first.");
    return;
  }

  try {
    const chainConfig = configCache[String(currentChainId)];
    if (!chainConfig?.address) {
      setMarketMessage("This app has not been deployed on the connected chain.");
      return;
    }

    const tokenA = marketTokenA?.value?.trim();
    const tokenB = marketTokenB?.value?.trim();
    const offerInput = marketOffer?.value?.trim();

    if (!tokenA || !tokenB || !offerInput) {
      setMarketMessage("Please select both tokens and enter an offer amount.");
      return;
    }

    if (tokenA.toLowerCase() === tokenB.toLowerCase()) {
      setMarketMessage("Receive token and pay token must be different.");
      return;
    }

    const offer = await parseTokenAmountInput(offerInput, tokenB);
    if (offer <= 0n) {
      setMarketMessage("Offer must be greater than 0.");
      return;
    }

    setMarketMessage("Scanning on-chain posted orders...");
    await refreshOrders();

    const desiredTokenA = tokenA.toLowerCase();
    const desiredTokenB = tokenB.toLowerCase();

    const rankedCandidates = ordersRows
      .filter((order) =>
        order.tokenA.toLowerCase() === desiredTokenA &&
        order.tokenB.toLowerCase() === desiredTokenB &&
        offer <= BigInt(order.amountB)
      )
      .map((order) => ({
        order,
        expectedOut: computeExpectedOutput(offer, BigInt(order.amountA), BigInt(order.amountB))
      }))
      .filter((item) => item.expectedOut > 0n)
      .sort((a, b) => {
        if (a.expectedOut === b.expectedOut) {
          if (a.order.blockNumber === b.order.blockNumber) {
            return b.order.logIndex - a.order.logIndex;
          }
          return a.order.blockNumber > b.order.blockNumber ? -1 : 1;
        }
        return a.expectedOut > b.expectedOut ? -1 : 1;
      });

    if (!rankedCandidates.length) {
      setMarketMessage("No fillable on-chain order matches this token pair and offer size.");
      return;
    }

    const chain = getChainById(currentChainId);
    const spender = getAddress(chainConfig.address);

    await ensureTokenApproval({
      tokenAddress: tokenB,
      spender,
      requiredAmount: offer,
      chain,
      statusText: (text) => setMarketMessage(text),
      statusHtml: (html) => {
        if (marketMessage) marketMessage.innerHTML = html;
      }
    });

    setMarketMessage("Selecting best executable order...");

    let selectedOrder = null;
    let selectedExpectedOut = 0n;
    let selectedGas = null;

    for (const candidate of rankedCandidates) {
      const args = [
        candidate.order.seller,
        candidate.order.tokenA,
        candidate.order.tokenB,
        candidate.order.amountA,
        candidate.order.amountB,
        candidate.order.deadline,
        candidate.order.nonce,
        candidate.order.signature,
        offer
      ];
      try {
        const gasEstimate = await estimateGasForContract({
          address: chainConfig.address,
          abi: ABI_FILL_ORDER,
          functionName: "fillOrder",
          args
        });
        selectedOrder = candidate.order;
        selectedExpectedOut = candidate.expectedOut;
        selectedGas = gasEstimate;
        break;
      } catch (_) {
        continue;
      }
    }

    if (!selectedOrder || !selectedGas) {
      setMarketMessage("No executable order is currently available for this market request.");
      return;
    }

    setMarketMessage("Submitting market fill transaction...");

    const hash = await walletClient.writeContract({
      account: currentAccount,
      address: getAddress(chainConfig.address),
      abi: ABI_FILL_ORDER,
      functionName: "fillOrder",
      args: [
        selectedOrder.seller,
        selectedOrder.tokenA,
        selectedOrder.tokenB,
        selectedOrder.amountA,
        selectedOrder.amountB,
        selectedOrder.deadline,
        selectedOrder.nonce,
        selectedOrder.signature,
        offer
      ],
      chain: chain ?? undefined,
      gas: selectedGas
    });

    const tokenADecimals = await getTokenDecimals(selectedOrder.tokenA);
    const expectedOutHuman = formatAmountForDisplay(selectedExpectedOut, tokenADecimals);
    const explorer = getExplorerBase(currentChainId);
    const shortHash = `${hash.slice(0, 6)}...${hash.slice(-4)}`;
    txBody.innerHTML = explorer
      ? `Market trade submitted. Hash: <a href="${explorer}/tx/${hash}" target="_blank" rel="noreferrer">${shortHash}</a><br />Expected receive amount: ${expectedOutHuman}`
      : `Market trade submitted. Hash: ${shortHash}<br />Expected receive amount: ${expectedOutHuman}`;
    txModal.hidden = false;
    setMarketMessage("");
    marketForm.reset();
    await refreshOrders();
  } catch (error) {
    logDetailedError("marketFill", error);
    setMarketMessage(`Error: ${getUiErrorMessage(error)}`);
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
