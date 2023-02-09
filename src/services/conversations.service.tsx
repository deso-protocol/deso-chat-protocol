import { identity } from "@deso-core/identity";
import {
  AccessGroupEntryResponse,
  ChatType,
  DecryptedMessageEntryResponse,
  NewMessageEntryResponse,
  PublicKeyToProfileEntryResponseMap,
} from "deso-protocol-types";
import { toast } from "react-toastify";
import { desoAPI } from "services/desoAPI.service";
import {
  DEFAULT_KEY_MESSAGING_GROUP_NAME,
  USER_TO_SEND_MESSAGE_TO,
} from "../utils/constants";
import { checkTransactionCompleted } from "../utils/helpers";
import { ConversationMap } from "../utils/types";

export const getConversationsNewMap = async (
  userPublicKeyBase58Check: string
): Promise<[ConversationMap, PublicKeyToProfileEntryResponseMap]> => {
  const [decryptedMessageResponses, publicKeyToProfileEntryResponseMap] =
    await getConversationNew(userPublicKeyBase58Check);
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
  userPublicKeyBase58Check: string
): Promise<
  [DecryptedMessageEntryResponse[], PublicKeyToProfileEntryResponseMap]
> => {
  const [messages, { AccessGroupsOwned, AccessGroupsMember }] =
    await Promise.all([
      desoAPI.accessGroup.GetAllUserMessageThreads({
        UserPublicKeyBase58Check: userPublicKeyBase58Check,
      }),
      desoAPI.accessGroup.GetAllUserAccessGroups({
        PublicKeyBase58Check: userPublicKeyBase58Check,
      }),
    ]);

  const allAccessGroups = Array.from(
    new Set([...(AccessGroupsOwned || []), ...(AccessGroupsMember || [])])
  );
  const decryptedMessageEntries = await decryptAccessGroupMessages(
    messages.MessageThreads,
    allAccessGroups
  );

  return [decryptedMessageEntries, messages.PublicKeyToProfileEntryResponse];
};

export const getConversations = async (
  userPublicKeyBase58Check: string
): Promise<[ConversationMap, PublicKeyToProfileEntryResponseMap]> => {
  try {
    let [Conversations, publicKeyToProfileEntryResponseMap] =
      await getConversationsNewMap(userPublicKeyBase58Check);

    if (Object.keys(Conversations).length === 0) {
      const txnHashHex = await encryptAndSendNewMessage(
        "Hi. This is my first test message!",
        userPublicKeyBase58Check,
        USER_TO_SEND_MESSAGE_TO
      );
      await checkTransactionCompleted(txnHashHex);
      [Conversations, publicKeyToProfileEntryResponseMap] =
        await getConversationsNewMap(userPublicKeyBase58Check);
    }
    return [Conversations, publicKeyToProfileEntryResponseMap];
  } catch (e: any) {
    toast.error(e.toString());
    console.error(e);
    return [{}, {}];
  }
};

export const decryptAccessGroupMessages = (
  messages: NewMessageEntryResponse[],
  accessGroups: AccessGroupEntryResponse[]
): Promise<DecryptedMessageEntryResponse[]> => {
  return Promise.all(
    (messages || []).map((m) => identity.decryptMessage(m, accessGroups))
  );
};

export const encryptAndSendNewMessage = async (
  messageToSend: string,
  senderPublicKeyBase58Check: string,
  RecipientPublicKeyBase58Check: string,
  RecipientMessagingKeyName = "default-key",
  SenderMessagingKeyName = "default-key"
): Promise<string> => {
  if (SenderMessagingKeyName !== "default-key") {
    return Promise.reject("sender must use default key for now");
  }

  const response = await desoAPI.accessGroup.CheckPartyAccessGroups({
    SenderPublicKeyBase58Check: senderPublicKeyBase58Check,
    SenderAccessGroupKeyName: SenderMessagingKeyName,
    RecipientPublicKeyBase58Check: RecipientPublicKeyBase58Check,
    RecipientAccessGroupKeyName: RecipientMessagingKeyName,
  });

  if (!response.SenderAccessGroupKeyName) {
    return Promise.reject("SenderAccessGroupKeyName is undefined");
  }

  let message: string;
  let isUnencrypted = false;
  const ExtraData: { [k: string]: string } = {};
  if (response.RecipientAccessGroupKeyName) {
    message = await identity.encryptMessage(
      response.RecipientAccessGroupPublicKeyBase58Check,
      messageToSend
    );
  } else {
    message = Buffer.from(messageToSend).toString("hex");
    isUnencrypted = true;
    ExtraData["unencrypted"] = "true";
  }

  if (!message) {
    return Promise.reject("error encrypting message");
  }

  const requestBody = {
    SenderAccessGroupOwnerPublicKeyBase58Check: senderPublicKeyBase58Check,
    SenderAccessGroupPublicKeyBase58Check:
      response.SenderAccessGroupPublicKeyBase58Check,
    SenderAccessGroupKeyName: SenderMessagingKeyName,
    RecipientAccessGroupOwnerPublicKeyBase58Check:
      RecipientPublicKeyBase58Check,
    RecipientAccessGroupPublicKeyBase58Check: isUnencrypted
      ? response.RecipientPublicKeyBase58Check
      : response.RecipientAccessGroupPublicKeyBase58Check,
    RecipientAccessGroupKeyName: response.RecipientAccessGroupKeyName,
    ExtraData,
    EncryptedMessageText: message,
    MinFeeRateNanosPerKB: 1000,
  };

  const tx = await (!RecipientMessagingKeyName ||
  RecipientMessagingKeyName === "default-key"
    ? desoAPI.accessGroup.SendDmMessage(requestBody, { broadcast: false })
    : desoAPI.accessGroup.SendGroupChatMessage(requestBody, {
        broadcast: false,
      }));
  const signedTx = await identity.signAndSubmit(tx);

  return signedTx.TxnHashHex;
};

export interface AccessGroupPrivateInfo {
  AccessGroupPublicKeyBase58Check: string;
  AccessGroupPrivateKeyHex: string;
  AccessGroupKeyName: string;
}
