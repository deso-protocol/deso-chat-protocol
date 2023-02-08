import { identity } from "@deso-core/identity";
import {
  AccessGroupEntryResponse,
  ChatType,
  DecryptedMessageEntryResponse,
  NewMessageEntryResponse,
} from "deso-protocol-types";
import { desoAPI } from "./deso.service";

// TODO: better typing
export const decryptAccessGroupMessages = (
  userPublicKeyBase58Check: string,
  messages: NewMessageEntryResponse[],
  accessGroups: AccessGroupEntryResponse[],
  options?: { decryptedKey: string }
): Promise<DecryptedMessageEntryResponse[]> => {
  return Promise.all(
    (messages || []).map((m) =>
      decryptAccessGroupMessage(
        userPublicKeyBase58Check,
        m,
        accessGroups,
        options
      )
    )
  );
};

export const decryptAccessGroupMessage = async (
  userPublicKeyBase58Check: string,
  message: NewMessageEntryResponse,
  accessGroups: AccessGroupEntryResponse[],
  options?: { decryptedKey: string }
): Promise<DecryptedMessageEntryResponse> => {
  // Okay we know we're dealing with DMs, so figuring out sender vs. receiver is easy.
  // Well now we're assuming that if you're messaging with base key or default key, you're the sender.
  const IsSender =
    message.SenderInfo.OwnerPublicKeyBase58Check === userPublicKeyBase58Check &&
    (message.SenderInfo.AccessGroupKeyName === "default-key" ||
      !message.SenderInfo.AccessGroupKeyName);

  const myAccessGroupInfo = IsSender
    ? message.SenderInfo
    : message.RecipientInfo;

  // okay we actually do need this ALL the time to decrypt stuff. we'll fix this up soon.
  if (!options?.decryptedKey) {
    return {
      ...message,
      ...{
        DecryptedMessage: "",
        IsSender,
        error:
          "must provide decrypted private messaging key in options for now",
      },
    };
  }

  let DecryptedMessage: string;
  if (message.ChatType === ChatType.DM) {
    if (
      message?.MessageInfo?.ExtraData &&
      message.MessageInfo.ExtraData["unencrypted"]
    ) {
      DecryptedMessage = Buffer.from(
        message.MessageInfo.EncryptedText,
        "hex"
      ).toString();
    } else {
      try {
        const decryptedMessageBuffer =
          await decryptAccessGroupMessageFromPrivateMessagingKey(
            userPublicKeyBase58Check,
            myAccessGroupInfo.AccessGroupKeyName,
            message
          );
        DecryptedMessage = decryptedMessageBuffer.toString();
      } catch (e) {
        return {
          ...message,
          ...{ DecryptedMessage: "", IsSender, error: (e as any).toString() },
        };
      }
    }
  } else {
    // ASSUMPTION: if it's a group chat, then the RECIPIENT has the group key name we need?
    const accessGroup = accessGroups.find((accessGroup) => {
      return (
        accessGroup.AccessGroupKeyName ===
          message.RecipientInfo.AccessGroupKeyName &&
        accessGroup.AccessGroupOwnerPublicKeyBase58Check ===
          message.RecipientInfo.OwnerPublicKeyBase58Check &&
        accessGroup.AccessGroupMemberEntryResponse
      );
    });
    if (
      !accessGroup ||
      !accessGroup.AccessGroupMemberEntryResponse?.EncryptedKey
    ) {
      console.error("access group not found");
      return {
        ...message,
        ...{
          DecryptedMessage: "",
          IsSender,
          error: "access group member entry not found",
        },
      };
    }

    try {
      const decryptedMessageBuffer =
        await decryptAccessGroupMessageFromPrivateMessagingKey(
          userPublicKeyBase58Check,
          accessGroup.AccessGroupKeyName,
          message
        );
      DecryptedMessage = decryptedMessageBuffer.toString();
    } catch (e) {
      console.error(e);
      return {
        ...message,
        ...{ DecryptedMessage: "", IsSender, error: (e as any).toString() },
      };
    }
  }

  return { ...message, ...{ DecryptedMessage, IsSender, error: "" } };
};

export function decryptAccessGroupMessageFromPrivateMessagingKey(
  userPublicKeyBase58Check: string,
  userMessagingKeyName: string,
  message: NewMessageEntryResponse
) {
  const isRecipient =
    message.RecipientInfo.OwnerPublicKeyBase58Check ===
      userPublicKeyBase58Check &&
    message.RecipientInfo.AccessGroupKeyName === userMessagingKeyName;
  const senderPublicKeyBase58Check =
    message.ChatType === ChatType.GROUPCHAT
      ? message.SenderInfo.AccessGroupPublicKeyBase58Check
      : isRecipient
      ? (message.SenderInfo.AccessGroupPublicKeyBase58Check as string)
      : (message.RecipientInfo.AccessGroupPublicKeyBase58Check as string);

  return identity.decryptChatMessage(
    senderPublicKeyBase58Check,
    message.MessageInfo.EncryptedText
  );
}

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
    message = await identity.encryptChatMessage(
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
