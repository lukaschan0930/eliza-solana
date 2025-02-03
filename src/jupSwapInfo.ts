import {
  ActionExample,
  generateText,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  ModelClass,
  State,
  type Action,
} from "@ai16z/eliza";
import BigNumber from "bignumber.js";

// console.log(BigNumber);


function formatSwapDetailsForDiscord(data, from: TokenInfo, to: TokenInfo) {
  // Extract input and output amounts
  const inAmount = Number(data.inAmount);
  const outAmount = Number(data.outAmount);
  return `${inAmount / Math.pow(10, from.decimals)} ${from.symbol} : ${
    outAmount / Math.pow(10, to.decimals)
  } ${to.symbol}`;
}

interface TokenInfo {
  decimals: number;
  symbol: string;
}

async function getTokenInfo(mintAddress: string): Promise<TokenInfo> {
  const res = await fetch(`https://tokens.jup.ag/token/${mintAddress}`);
  const data = await res.json();
  return { decimals: data.decimals, symbol: data.symbol };
}
export const jupSwapInfo: Action = {
  name: "JUP_SWAP",
  similes: ["SWAP", "SWAP__INFO", "SWAP_TOKENS"],
  validate: async (_runtime: IAgentRuntime, _message: Memory) => {
    return true;
  },
  description: "Fetch and display swap info for provided mints and token",
  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
    _options: { [key: string]: unknown },
    callback: HandlerCallback
  ): Promise<boolean> => {
    try {
      const context = `Extract the swap addresses, amount and slippage from the user's message. The message is: ${_message.content.text}
                Only respond with the swap addresses, amount and slippage, follow this schema {"from": 'So11111111111111111111111111111111111111112',"to": 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',"amount": 200,"slippage": 2}, mention only values, do not include any other text
            `;

      const searchTerm = await generateText({
        runtime,
        context,
        modelClass: ModelClass.SMALL,
        stop: ["\n"],
      });
      // console.log(searchTerm, typeof searchTerm);

      const { amount, from, to, slippage } = JSON.parse(searchTerm);

      const fromToken = await getTokenInfo(from);
      const toToken = await getTokenInfo(to);

      const fromDecimals = new BigNumber(fromToken.decimals);

      const amountBN = new BigNumber(amount);
      const adjustedAmount = amountBN.multipliedBy(
        new BigNumber(10).pow(fromDecimals)
      );
      // console.log(searchTerm.replaceAll(" ", "").split(","));

      const response = await fetch(
        `https://quote-api.jup.ag/v6/quote?inputMint=${from}&outputMint=${to}&amount=${adjustedAmount}&slippageBps=${slippage}`
      );
      const data = await response.json();

      const res = formatSwapDetailsForDiscord(data, fromToken, toToken);
      await callback({
        text: res,
      });
    } catch (_error) {
      // console.log(_error);

      await callback({
        text: "Sorry, there was an error fetching the swap info.",
      });
    }

    return true;
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: { text: "Swap 100 SOL to USDC" },
      },
      {
        user: "{{user2}}",
        content: {
          text: "",
          action: "TOKEN_SWAP",
          details: { from: "SOL", to: "USDC", amount: "100" },
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "How much EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v I can get for So11111111111111111111111111111111111111112 with 10% slippage",
        },
      },
      {
        user: "{{user2}}",
        content: {
          text: "",
          action: "TOKEN_SWAP",
          details: { from: "USDT", to: "SOL", amount: "50" },
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "swap 100 DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263 to EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v with slipage 2 percent",
        },
      },
      {
        user: "{{user2}}",
        content: {
          text: "",
          action: "TOKEN_SWAP",
          details: { from: "SOL", to: "USDC", amount: "200" },
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: { text: "Convert 300 USDT to BTC" },
      },
      {
        user: "{{user2}}",
        content: {
          text: "",
          action: "TOKEN_SWAP",
          details: { from: "USDT", to: "BTC", amount: "300" },
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: { text: "Can you swap 500 ETH to USDC for me?" },
      },
      {
        user: "{{user2}}",
        content: {
          text: "",
          action: "TOKEN_SWAP",
          details: { from: "ETH", to: "USDC", amount: "500" },
        },
      },
    ],
  ] as ActionExample[][],
} as Action;
