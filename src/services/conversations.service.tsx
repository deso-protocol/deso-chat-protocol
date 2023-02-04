import Deso from 'deso-protocol';
import {
  ChatType,
  DecryptedMessageEntryResponse,
  DerivedPrivateUserInfo,
  PublicKeyToProfileEntryResponseMap,
} from 'deso-protocol-types';
import { decryptAccessGroupMessages, encryptAndSendNewMessage } from "./crypto-utils.service";
import { toast } from "react-toastify";
import { USER_TO_SEND_MESSAGE_TO } from "../utils/constants";
import { ConversationMap } from "../utils/types";
import { checkTransactionCompleted } from "./backend.service";

export const getConversationsNewMap = async (
  deso: Deso,
  derivedResponse: Partial<DerivedPrivateUserInfo>
): Promise<[ConversationMap, PublicKeyToProfileEntryResponseMap]> => {
  const [decryptedMessageResponses, publicKeyToProfileEntryResponseMap] = await getConversationNew(
    deso,
    derivedResponse
  );
  const Conversations: ConversationMap = {};
  decryptedMessageResponses.forEach((dmr) => {
    const otherInfo = dmr.ChatType === ChatType.DM ? (dmr.IsSender ? dmr.RecipientInfo : dmr.SenderInfo ) : dmr.RecipientInfo;
    const key = otherInfo.OwnerPublicKeyBase58Check + (otherInfo.AccessGroupKeyName ? otherInfo.AccessGroupKeyName : 'default-key');
    const currentConversation = Conversations[key];
    if (currentConversation) {
      currentConversation.messages.push(dmr);
      currentConversation.messages.sort((a, b) => b.MessageInfo.TimestampNanos - a.MessageInfo.TimestampNanos);
      return;
    }
    Conversations[key] = { firstMessagePublicKey: otherInfo.OwnerPublicKeyBase58Check, messages: [dmr], ChatType: dmr.ChatType };
  });
  return [Conversations, publicKeyToProfileEntryResponseMap];
};

export const getConversationNew = async (
  deso: Deso,
  derivedResponse: Partial<DerivedPrivateUserInfo>
): Promise<[DecryptedMessageEntryResponse[], PublicKeyToProfileEntryResponseMap]> => {
  if (!derivedResponse) {
    toast.error('No derived response found');
    return [[], {}];
  }

  const [messages, { AccessGroupsOwned, AccessGroupsMember }] = await Promise.all([
    deso.accessGroup.GetAllUserMessageThreads({
      UserPublicKeyBase58Check: deso.identity.getUserKey() as string
    }),
    deso.accessGroup.GetAllUserAccessGroups({
      PublicKeyBase58Check: deso.identity.getUserKey() as string,
    })
  ]);

  const allAccessGroups = Array.from(new Set([...(AccessGroupsOwned || []), ...(AccessGroupsMember || [])]));
  return [decryptAccessGroupMessages(
    deso.identity.getUserKey() as string,
    messages.MessageThreads,
    allAccessGroups,
    { decryptedKey: derivedResponse.messagingPrivateKey as string }
  ), messages.PublicKeyToProfileEntryResponse];
};

export const getConversations = async (
  deso: Deso,
  derivedResponse: Partial<DerivedPrivateUserInfo>,
): Promise<[ConversationMap, PublicKeyToProfileEntryResponseMap]> => {
  try {
    if (!derivedResponse) {
      toast.error('Derived call failed');
      return [{}, {}];
    }

    let [Conversations, publicKeyToProfileEntryResponseMap] = await getConversationsNewMap(deso, derivedResponse);

    let conversationsArray = Object.keys(Conversations);
    if (conversationsArray.length === 0) {
      const txnHashHex = await encryptAndSendNewMessage(
        deso,
        'Hi. This is my first test message!',
        derivedResponse.derivedSeedHex as string,
        derivedResponse.messagingPrivateKey as string,
        USER_TO_SEND_MESSAGE_TO,
        true
      );
      await checkTransactionCompleted(deso, txnHashHex);
      [Conversations, publicKeyToProfileEntryResponseMap] = await getConversationsNewMap(deso, derivedResponse);
    }
    return [Conversations, publicKeyToProfileEntryResponseMap];
  } catch (e: any) {
    toast.error(e.toString());
    console.error(e);
    return [{}, {}];
  }
};
