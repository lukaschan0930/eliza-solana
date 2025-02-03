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

function formatTokenInfoForDiscord(token: TokenInfo) {
  return token.toReadableString();
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

async function getTokenInfo(mintAddress: string): Promise<TokenInfo> {
  const res = await fetch(`https://tokens.jup.ag/token/${mintAddress}`);
  const data = await res.json();
//   console.log(data);

  return new TokenInfo(data);
}

export const jupTokenInfo: Action = {
  name: "JUP_INFO",
  similes: ["TOKEN", "TOKEN__INFO"],
  validate: async (_runtime: IAgentRuntime, _message: Memory) => {
    return true;
  },
  description: "Fetch and display token info for provided token mint address",
  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
    _options: { [key: string]: unknown },
    callback: HandlerCallback
  ): Promise<boolean> => {
    try {
      const context = `Extract the token mint address from the user's message. The message is: ${_message.content.text}
                  Only respond with the token mint address, follow this schema {"mintAddress": 'So11111111111111111111111111111111111111112'}, mention only values, do not include any other text
              `;

      const searchTerm = await generateText({
        runtime,
        context,
        modelClass: ModelClass.SMALL,
        stop: ["\n"],
      });
    //   console.log(searchTerm, typeof searchTerm);

      const { mintAddress } = JSON.parse(searchTerm);

      const tokenInfo = await getTokenInfo(mintAddress);

      const res = formatTokenInfoForDiscord(tokenInfo);
      await callback({
        text: res,
      });
    } catch (_error) {
    //   console.log(_error);

      await callback({
        text: "Sorry, there was an error fetching the token info.",
      });
    }

    return true;
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Tell me about the token with mint address So11111111111111111111111111111111111111112",
        },
      },
      {
        user: "{{user2}}",
        content: {
          text: "",
          action: "TOKEN_INFO",
          details: {
            mintAddress: "So11111111111111111111111111111111111111112",
          },
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Get info for token EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        },
      },
      {
        user: "{{user2}}",
        content: {
          text: "",
          action: "TOKEN_INFO",
          details: {
            mintAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          },
        },
      },
    ],
  ] as ActionExample[][],
} as Action;
