import { PrimaryDerivedKeyInfo } from "@deso-core/identity";
import { AppUser } from "contexts/UserContext";
import {
  ChatType,
  DecryptedMessageEntryResponse,
  PublicKeyToProfileEntryResponseMap,
} from "deso-protocol-types";
import { toast } from "react-toastify";
import { desoAPI } from "services/deso.service";
import { USER_TO_SEND_MESSAGE_TO } from "../utils/constants";
import { checkTransactionCompleted } from "../utils/helpers";
import { ConversationMap } from "../utils/types";
import {
  decryptAccessGroupMessages,
  encryptAndSendNewMessage,
} from "./crypto.service";

export const getConversationsNewMap = async (
  derivedResponse: PrimaryDerivedKeyInfo
): Promise<[ConversationMap, PublicKeyToProfileEntryResponseMap]> => {
  const [decryptedMessageResponses, publicKeyToProfileEntryResponseMap] =
    await getConversationNew(derivedResponse);
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
        : "default-key");
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
  derivedResponse: PrimaryDerivedKeyInfo
): Promise<
  [DecryptedMessageEntryResponse[], PublicKeyToProfileEntryResponseMap]
> => {
  if (!derivedResponse) {
    toast.error("No derived response found");
    return [[], {}];
  }

  const [messages, { AccessGroupsOwned, AccessGroupsMember }] =
    await Promise.all([
      desoAPI.accessGroup.GetAllUserMessageThreads({
        UserPublicKeyBase58Check: derivedResponse.publicKeyBase58Check,
      }),
      desoAPI.accessGroup.GetAllUserAccessGroups({
        PublicKeyBase58Check: derivedResponse.publicKeyBase58Check,
      }),
    ]);

  const allAccessGroups = Array.from(
    new Set([...(AccessGroupsOwned || []), ...(AccessGroupsMember || [])])
  );
  const decryptedMessageEntries = await decryptAccessGroupMessages(
    derivedResponse.publicKeyBase58Check,
    messages.MessageThreads,
    allAccessGroups,
    { decryptedKey: derivedResponse.messagingPrivateKey as string }
  );

  return [decryptedMessageEntries, messages.PublicKeyToProfileEntryResponse];
};

export const getConversations = async (
  appUser: AppUser
): Promise<[ConversationMap, PublicKeyToProfileEntryResponseMap]> => {
  try {
    if (!appUser.primaryDerivedKey?.derivedSeedHex) {
      toast.error("no derived private key available");
      return [{}, {}];
    }

    let [Conversations, publicKeyToProfileEntryResponseMap] =
      await getConversationsNewMap(appUser.primaryDerivedKey);

    let conversationsArray = Object.keys(Conversations);
    if (conversationsArray.length === 0) {
      const txnHashHex = await encryptAndSendNewMessage(
        "Hi. This is my first test message!",
        appUser.PublicKeyBase58Check,
        USER_TO_SEND_MESSAGE_TO
      );
      await checkTransactionCompleted(txnHashHex);
      [Conversations, publicKeyToProfileEntryResponseMap] =
        await getConversationsNewMap(appUser.primaryDerivedKey);
    }
    return [Conversations, publicKeyToProfileEntryResponseMap];
  } catch (e: any) {
    toast.error(e.toString());
    console.error(e);
    return [{}, {}];
  }
};
