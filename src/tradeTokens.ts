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
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  AccountInfo,
  Connection,
  LAMPORTS_PER_SOL,
  ParsedAccountData,
  PublicKey,
} from "@solana/web3.js";
import BigNumber from "bignumber.js";

// console.log(BigNumber);

function formatSwapDetailsForDiscord(
  data: any,
  from: TokenInfo,
  to: TokenInfo,
  fromWallet: string,
  toWallet: string
) {
  const inAmount = Number(data.inAmount);
  const outAmount = Number(data.outAmount);
  return `Swap ${inAmount / Math.pow(10, from.decimals)} ${
    from.symbol
  } from ${fromWallet} to ${outAmount / Math.pow(10, to.decimals)} ${
    to.symbol
  } to ${toWallet}`;
}

interface TokenInfo {
  decimals: number;
  symbol: string;
}

export const CONNECTION = new Connection(process.env.MAINNET_RPC_URL);

export async function getTokens(owner: PublicKey) {
  try {
    const response = await CONNECTION.getParsedTokenAccountsByOwner(
      owner,
      {
        programId: TOKEN_PROGRAM_ID,
      },
      "processed"
    );
    const response2022 = await CONNECTION.getParsedTokenAccountsByOwner(
      owner,
      {
        programId: TOKEN_2022_PROGRAM_ID,
      },
      "processed"
    );

    const validTokens = response.value.filter(
      (token) =>
        token.account.data.parsed.info.tokenAmount.amount > 0 &&
        token.account.data.parsed.info.tokenAmount.decimals > 0 &&
        token.account.data.parsed.info.state === "initialized"
    );
    const validTokens2022 = response2022.value.filter(
      (token) =>
        token.account.data.parsed.info.tokenAmount.amount > 0 &&
        token.account.data.parsed.info.tokenAmount.decimals > 0 &&
        token.account.data.parsed.info.state === "initialized"
    );
    console.log(validTokens.concat(validTokens2022));

    return validTokens.concat(validTokens2022);
  } catch (err) {
    console.log(`Error fetching tokens by owner(${owner.toBase58()}): `, err);
    return;
  }
}

class TokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI: string;
  tags: string[];
  daily_volume: number;
  created_at: string;
  freeze_authority: string | null;
  mint_authority: string | null;
  permanent_delegate: string | null;
  minted_at: string | null;
  extensions: {
    coingeckoId: string;
  };

  constructor(data: any) {
    this.address = data.address;
    this.name = data.name;
    this.symbol = data.symbol;
    this.decimals = data.decimals;
    this.logoURI = data.logoURI;
    this.tags = data.tags;
    this.daily_volume = data.daily_volume;
    this.created_at = data.created_at;
    this.freeze_authority = data.freeze_authority;
    this.mint_authority = data.mint_authority;
    this.permanent_delegate = data.permanent_delegate;
    this.minted_at = data.minted_at;
    this.extensions = data.extensions;
  }

  toReadableString(): string {
    return `
    🔹 Name: ${this.name} (${this.symbol})
    🔹 Address: ${this.address}
    🔹 Decimals: ${this.decimals}
    🔹 Daily Volume: ${this.daily_volume.toLocaleString()}
    🔹 Created At: ${new Date(this.created_at).toLocaleString()}
    🔹 Tags: ${this.tags.join(", ")}
    🔹 Logo: ${this.logoURI}
    🔹 CoinGecko ID: ${this.extensions.coingeckoId}`;
  }
}

type SolanaParsedAccount = {
  pubkey: PublicKey;
  account: AccountInfo<ParsedAccountData>;
};

type JupiterApiToken = {
  address: string;
  chainId: number;
  decimals: number;
  name: string;
  symbol: string;
  logoURI: string;
  tags: string[];
};

export async function getToken(mint: string) {
  try {
    const response = await fetch(`https://tokens.jup.ag/token/${mint}`);
    if (!response.ok)
      throw new Error(`Response status - JUP all tokens: ${response.status}`);
    const token: JupiterApiToken = await response.json();
    return token;
  } catch (err) {
    console.error(err);
    return;
  }
}

async function getTokenInfo(data: SolanaParsedAccount) {
  const program = data.account.data.program;
  const accountMint = data.pubkey.toBase58();
  const mint = data.account.data.parsed.info.mint;
  const uiAmount = +(+data.account.data.parsed.info.tokenAmount.uiAmount)
    .toLocaleString("en", { maximumFractionDigits: 9 })
    .replace(/,/g, "");
  const decimals = data.account.data.parsed.info.tokenAmount.decimals;
  const extensions: any[] = data.account.data.parsed.info.extensions ?? [];
  const hasTransferFee = extensions
    ? extensions.some((value) => value.extension === "transferFeeAmount")
    : false;

  const jupApiAsset = await getToken(mint as string);
  if (!jupApiAsset) return;

  return {
    program: program,
    account: accountMint,
    hasTransferFee: hasTransferFee,
    mint: mint,
    name: jupApiAsset.name,
    symbol: jupApiAsset.symbol,
    amount: uiAmount.toString().includes("e")
      ? Number(uiAmount.toFixed(0))
      : uiAmount,
    decimals: decimals,
    imageUrl: jupApiAsset.logoURI,
    cost: 0,
  };
}

async function isTokenSufficient(
  token_symbol: string,
  wallet_address: string,
  amount: number
) {
  if (
    token_symbol.toLowerCase() === "sol" ||
    token_symbol.toLowerCase() === "solana"
  ) {
    const balance = await CONNECTION.getBalance(
      new PublicKey(wallet_address),
      "confirmed"
    );
    const convertedBalance = balance / LAMPORTS_PER_SOL;
    return convertedBalance >= amount;
  } else {
    const maker_tokens = await getTokens(new PublicKey(wallet_address));

    const processedAccounts = await Promise.all(
      maker_tokens.map(async (account) => {
        let accountMetadata = await getTokenInfo(account);
        if (
          accountMetadata.symbol.toLowerCase() === token_symbol.toLowerCase()
        ) {
          return accountMetadata;
        }
      })
    );
    const tokenAccount = processedAccounts.filter((item) => !!item);
    if (tokenAccount.length > 0) {
      return tokenAccount[0].amount >= amount;
    } else {
      return false;
    }
  }
}

export const tradeTokens: Action = {
  name: "TRADE",
  similes: ["SWAP", "TRADE", "TRANSFER"],
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
      const context = `Extract the swap details from the user's message. The message is: ${_message.content.text}
                  Only respond with the swap details, follow this schema {"from_token":'sol',"to_token": 'usdc',"send_amount": 200, "receive_amount": 200, "fromWallet": "wallet_address_1", "toWallet": "wallet_address_2"}, mention only values, do not include any other text`;

      const searchTerm = await generateText({
        runtime,
        context,
        modelClass: ModelClass.SMALL,
        stop: ["\n"],
      });

      const {
        send_amount,
        receive_amount,
        from_token,
        to_token,
        fromWallet,
        toWallet,
      } = JSON.parse(searchTerm);

      console.log(
        send_amount,
        receive_amount,
        from_token,
        to_token,
        fromWallet,
        toWallet
      );

      const makerBalanceSufficient = await isTokenSufficient(
        from_token,
        fromWallet,
        send_amount
      );

      const takerBalanceSufficient = await isTokenSufficient(
        to_token,
        toWallet,
        receive_amount
      );

      console.log(makerBalanceSufficient);
      console.log(takerBalanceSufficient);

      await callback({
        text: "res",
      });
    } catch (_error) {
      // console.log(_error);

      await callback({
        text: "Sorry, there was an error processing the trade.",
      });
    }

    return true;
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: { text: "Swap 10 SOL to 1 USDC from wallet_1 to wallet_2" },
      },
      {
        user: "{{user2}}",
        content: {
          text: "",
          action: "TOKEN_TRADE",
          details: {
            from: "SOL",
            to: "USDC",
            amount: "10",
            fromWallet: "wallet_1",
            toWallet: "wallet_2",
          },
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Transfer 10 SOL for 5 USDC from 8xzt6HrynLyiLpU17Qd8xGhCSfKv9WJqRKHsmzYdvvQP to 6izt4HswnLyiLpU17Qd8xGhCSfKv9WJqRKHsmzYdvvQK",
        },
      },
      {
        user: "{{user2}}",
        content: {
          text: "",
          action: "TOKEN_TRADE",
          details: {
            from: "SOL",
            to: "USDC",
            amount: "10",
            fromAmount: "10",
            toAmount: "5",
            fromWallet: "8xzt6HrynLyiLpU17Qd8xGhCSfKv9WJqRKHsmzYdvvQP",
            toWallet: "6izt4HswnLyiLpU17Qd8xGhCSfKv9WJqRKHsmzYdvvQK",
          },
        },
      },
    ],
  ] as ActionExample[][],
} as Action;
