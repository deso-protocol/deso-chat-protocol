import { shortenLongWord } from "components/search-users";
import { AppUser } from "contexts/UserContext";
import { ChatType } from "deso-protocol-types";
import { desoAPI } from "services/desoAPI.service";
import { PUBLIC_KEY_LENGTH, PUBLIC_KEY_PREFIX } from "./constants";
import { Conversation } from "./types";

export const copyTextToClipboard = async (text: string) => {
  return navigator.clipboard.writeText(text);
};

export const getProfileURL = (username: string | undefined): string => {
  return username ? `${process.env.REACT_APP_NODE_URL}/u/${username}` : "";
};

export const desoNanosToDeso = (nanos: number | string | bigint) => {
  return Number(nanos) / 1e9;
};

export const scrollContainerToElement = (
  cointainerSelector: string,
  elementSelector: string
) => {
  setTimeout(() => {
    const container = document.querySelector(cointainerSelector);
    const element = document.querySelector(elementSelector);

    if (container && element && element instanceof HTMLElement) {
      container.scrollTo(0, element.offsetTop);
    }
  }, 0);
};

export const getChatNameFromConversation = (
  conversation: Conversation,
  getUsernameByPublicKeyBase58Check: { [key: string]: string }
) => {
  return conversation.ChatType === ChatType.DM
    ? getUsernameByPublicKeyBase58Check[conversation.firstMessagePublicKey] ??
        null
    : conversation.messages[0].RecipientInfo.AccessGroupKeyName;
};

export const isMaybeDeSoPublicKey = (query: string): boolean => {
  return (
    query.length === PUBLIC_KEY_LENGTH && query.startsWith(PUBLIC_KEY_PREFIX)
  );
};

export const isMaybeETHAddress = (query: string): boolean => {
  return /^0x[a-fA-F0-9]{40}$/g.test(query);
};

export const isMaybeENSName = (query: string): boolean => {
  return /(\.eth)$/g.test(query);
};

export const formatDisplayName = (user: AppUser) => {
  const maybeUserName = user?.ProfileEntryResponse?.Username;

  return maybeUserName
    ? `@${maybeUserName}`
    : shortenLongWord(user?.PublicKeyBase58Check);
};

export const hasSetupMessaging = (user: AppUser | null) => {
  return !!user?.accessGroupsOwned?.find(
    ({ AccessGroupKeyName }) => AccessGroupKeyName === "default-key"
  );
};

export const checkTransactionCompleted = (hashHex: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      desoAPI.transaction
        .getTransaction(hashHex)
        .then(({ TxnFound }) => {
          if (TxnFound) {
            resolve();
          } else {
            resolve(checkTransactionCompleted(hashHex));
          }
        })
        .catch(() => reject(new Error("Error when getting transaction")));
    }, 150);
  });
};
