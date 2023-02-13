import { identity, publicKeyToBase58Check } from "@deso-core/identity";
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
  userPublicKeyBase58Check: string,
  allAccessGroups: AccessGroupEntryResponse[]
): Promise<
  [
    ConversationMap,
    PublicKeyToProfileEntryResponseMap,
    AccessGroupEntryResponse[]
  ]
> => {
  const [
    decryptedMessageResponses,
    publicKeyToProfileEntryResponseMap,
    newAllAccessGroups,
  ] = await getConversationNew(userPublicKeyBase58Check, allAccessGroups);
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
  return [
    Conversations,
    publicKeyToProfileEntryResponseMap,
    newAllAccessGroups,
  ];
};

export const getConversationNew = async (
  userPublicKeyBase58Check: string,
  allAccessGroups: AccessGroupEntryResponse[]
): Promise<
  [
    DecryptedMessageEntryResponse[],
    PublicKeyToProfileEntryResponseMap,
    AccessGroupEntryResponse[]
  ]
> => {
  const messages = await desoAPI.accessGroup.GetAllUserMessageThreads({
    UserPublicKeyBase58Check: userPublicKeyBase58Check,
  });
  const [decryptedMessageEntries, updatedAllAccessGroups] =
    await decryptAccessGroupMessagesWithRetry(
      userPublicKeyBase58Check,
      messages.MessageThreads,
      allAccessGroups
    );
  return [
    decryptedMessageEntries,
    messages.PublicKeyToProfileEntryResponse,
    updatedAllAccessGroups,
  ];
};

export const getConversations = async (
  userPublicKeyBase58Check: string,
  allAccessGroups: AccessGroupEntryResponse[]
): Promise<
  [
    ConversationMap,
    PublicKeyToProfileEntryResponseMap,
    AccessGroupEntryResponse[]
  ]
> => {
  try {
    let [
      Conversations,
      publicKeyToProfileEntryResponseMap,
      newAllAccessGroups,
    ] = await getConversationsNewMap(userPublicKeyBase58Check, allAccessGroups);

    if (Object.keys(Conversations).length === 0) {
      const txnHashHex = await encryptAndSendNewMessage(
        "Hi. This is my first test message!",
        userPublicKeyBase58Check,
        USER_TO_SEND_MESSAGE_TO
      );
      await checkTransactionCompleted(txnHashHex);
      [Conversations, publicKeyToProfileEntryResponseMap, newAllAccessGroups] =
        await getConversationsNewMap(userPublicKeyBase58Check, allAccessGroups);
    }
    return [
      Conversations,
      publicKeyToProfileEntryResponseMap,
      newAllAccessGroups,
    ];
  } catch (e: any) {
    toast.error(e.toString());
    console.error(e);
    return [{}, {}, []];
  }
};

export const decryptAccessGroupMessagesWithRetry = async (
  publicKeyBase58Check: string,
  messages: NewMessageEntryResponse[],
  accessGroups: AccessGroupEntryResponse[]
): Promise<[DecryptedMessageEntryResponse[], AccessGroupEntryResponse[]]> => {
  let decryptedMessageEntries = await decryptAccessGroupMessages(
    messages,
    accessGroups
  );

  // Naive approach to figuring out which access groups we need to fetch.
  const accessGroupsToFetch = decryptedMessageEntries.filter(
    (dmr) => dmr.error === "Error: access group key not found for group message"
  );
  if (accessGroupsToFetch.length > 0) {
    const newAllAccessGroups = await desoAPI.accessGroup.GetAllUserAccessGroups(
      {
        PublicKeyBase58Check: publicKeyBase58Check,
      }
    );
    accessGroups = (newAllAccessGroups.AccessGroupsOwned || []).concat(
      newAllAccessGroups.AccessGroupsMember || []
    );
    decryptedMessageEntries = await decryptAccessGroupMessages(
      messages,
      accessGroups
    );
  }

  return [decryptedMessageEntries, accessGroups];
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
  RecipientMessagingKeyName = DEFAULT_KEY_MESSAGING_GROUP_NAME,
  SenderMessagingKeyName = DEFAULT_KEY_MESSAGING_GROUP_NAME
): Promise<string> => {
  if (SenderMessagingKeyName !== DEFAULT_KEY_MESSAGING_GROUP_NAME) {
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
  RecipientMessagingKeyName === DEFAULT_KEY_MESSAGING_GROUP_NAME
    ? desoAPI.accessGroup.SendDmMessage(requestBody, { broadcast: false })
    : desoAPI.accessGroup.SendGroupChatMessage(requestBody, {
        broadcast: false,
      }));
  const signedTx = await identity.signAndSubmit(tx);

  return signedTx.TxnHashHex;
};
