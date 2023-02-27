import { shortenLongWord } from "components/search-users";
import { AppUser } from "contexts/UserContext";
import { ChatType, User } from "deso-protocol";
import {
  DEFAULT_KEY_MESSAGING_GROUP_NAME,
  PUBLIC_KEY_LENGTH,
  PUBLIC_KEY_PREFIX,
} from "./constants";
import { Conversation } from "./types";

export const copyTextToClipboard = async (text: string) => {
  return navigator.clipboard.writeText(text);
};

export const getProfileURL = (username: string | undefined): string => {
  return username ? `${process.env.REACT_APP_PROFILE_URL}/u/${username}` : "";
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

export const formatDisplayName = (user: User, prefix = "@") => {
  const maybeUserName = user?.ProfileEntryResponse?.Username;

  return maybeUserName
    ? `${prefix}${maybeUserName}`
    : shortenLongWord(user?.PublicKeyBase58Check);
};

export const hasSetupMessaging = (user: AppUser | null) => {
  return !!user?.accessGroupsOwned?.find(
    ({ AccessGroupKeyName }) =>
      AccessGroupKeyName === DEFAULT_KEY_MESSAGING_GROUP_NAME
  );
};
