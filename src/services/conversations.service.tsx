import { AppUser } from "contexts/UserContext";
import {
  ChatType,
  DecryptedMessageEntryResponse,
  PublicKeyToProfileEntryResponseMap,
} from "deso-protocol-types";
import { toast } from "react-toastify";
import { desoAPI } from "services/deso.service";
import {
  DEFAULT_KEY_MESSAGING_GROUP_NAME,
  USER_TO_SEND_MESSAGE_TO,
} from "../utils/constants";
import { checkTransactionCompleted } from "../utils/helpers";
import { ConversationMap } from "../utils/types";
import {
  decryptAccessGroupMessages,
  encryptAndSendNewMessage,
} from "./crypto.service";

export const getConversationsNewMap = async (
  appUser: AppUser
): Promise<[ConversationMap, PublicKeyToProfileEntryResponseMap]> => {
  const [decryptedMessageResponses, publicKeyToProfileEntryResponseMap] =
    await getConversationNew(appUser);
  const Conversations: ConversationMap = {};
  decryptedMessageResponses.forEach((dmr) => {
    const otherInfo =
      dmr.ChatType === ChatType.DM
        ? dmr.IsSender
          ? dmr.RecipientInfo
          : dmr.SenderInfo
        : dmr.RecipientInfo;
    const key =
      otherInfo.OwnerPublicKeyBase58Check +
      (otherInfo.AccessGroupKeyName
        ? otherInfo.AccessGroupKeyName
        : DEFAULT_KEY_MESSAGING_GROUP_NAME);
    const currentConversation = Conversations[key];
    if (currentConversation) {
      currentConversation.messages.push(dmr);
      currentConversation.messages.sort(
        (a, b) => b.MessageInfo.TimestampNanos - a.MessageInfo.TimestampNanos
      );
      return;
    }
    Conversations[key] = {
      firstMessagePublicKey: otherInfo.OwnerPublicKeyBase58Check,
      messages: [dmr],
      ChatType: dmr.ChatType,
    };
  });
  return [Conversations, publicKeyToProfileEntryResponseMap];
};

export const getConversationNew = async (
  appUser: AppUser
): Promise<
  [DecryptedMessageEntryResponse[], PublicKeyToProfileEntryResponseMap]
> => {
  if (!appUser) {
    toast.error("You must be logged in to get conversations");
    return [[], {}];
  }

  const [messages, { AccessGroupsOwned, AccessGroupsMember }] =
    await Promise.all([
      desoAPI.accessGroup.GetAllUserMessageThreads({
        UserPublicKeyBase58Check: appUser.PublicKeyBase58Check,
      }),
      desoAPI.accessGroup.GetAllUserAccessGroups({
        PublicKeyBase58Check: appUser.PublicKeyBase58Check,
      }),
    ]);

  const allAccessGroups = Array.from(
    new Set([...(AccessGroupsOwned || []), ...(AccessGroupsMember || [])])
  );
  const decryptedMessageEntries = await decryptAccessGroupMessages(
    appUser.PublicKeyBase58Check,
    messages.MessageThreads,
    allAccessGroups
  );

  return [decryptedMessageEntries, messages.PublicKeyToProfileEntryResponse];
};

export const getConversations = async (
  appUser: AppUser
): Promise<[ConversationMap, PublicKeyToProfileEntryResponseMap]> => {
  try {
    if (!appUser) {
      toast.error("no derived private key available");
      return [{}, {}];
    }

    let [Conversations, publicKeyToProfileEntryResponseMap] =
      await getConversationsNewMap(appUser);

    if (Object.keys(Conversations).length === 0) {
      const txnHashHex = await encryptAndSendNewMessage(
        "Hi. This is my first test message!",
        appUser.PublicKeyBase58Check,
        USER_TO_SEND_MESSAGE_TO
      );
      await checkTransactionCompleted(txnHashHex);
      [Conversations, publicKeyToProfileEntryResponseMap] =
        await getConversationsNewMap(appUser);
    }
    return [Conversations, publicKeyToProfileEntryResponseMap];
  } catch (e: any) {
    toast.error(e.toString());
    console.error(e);
    return [{}, {}];
  }
};
