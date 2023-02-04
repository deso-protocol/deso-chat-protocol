import { ChatType } from "deso-protocol-types";
import { Conversation } from "./types";
import { PUBLIC_KEY_LENGTH, PUBLIC_KEY_PREFIX } from "./constants";

export const copyTextToClipboard = async (text: string) => {
  return navigator.clipboard.writeText(text);
};

export const getProfileURL = (username: string | undefined): string => {
  return username ? `${process.env.REACT_APP_NODE_URL}/u/${username}` : "";
}

export const desoNanosToDeso = (nanos: number | string | bigint) => {
  return Number(nanos) / 1e9;
};

export const scrollContainerToElement = (cointainerSelector: string, elementSelector: string) => {
  setTimeout(() => {
    const container = document.querySelector(cointainerSelector);
    const element = document.querySelector(elementSelector);

    if (container && element && element instanceof HTMLElement) {
      container.scrollTo(0, element.offsetTop);
    }
  }, 0);
}

export const getChatNameFromConversation = (conversation: Conversation, getUsernameByPublicKeyBase58Check: { [key: string]: string }) => {
  return conversation.ChatType === ChatType.DM
    ? (getUsernameByPublicKeyBase58Check[conversation.firstMessagePublicKey] ?? null)
    : conversation.messages[0].RecipientInfo.AccessGroupKeyName
}

export const isMaybeDeSoPublicKey = (query: string): boolean => {
  return query.length === PUBLIC_KEY_LENGTH && query.startsWith(PUBLIC_KEY_PREFIX);
}

export const isMaybeETHAddress = (query: string): boolean => {
  return /^0x[a-fA-F0-9]{40}$/g.test(query);
}
export const isMaybeENSName = (query: string): boolean => {
  return /(\.eth)$/g.test(query);
}
