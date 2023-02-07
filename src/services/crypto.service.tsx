import { identity } from "@deso-core/identity";
import * as bs58check from "bs58check";
import { AppUser } from "contexts/UserContext";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "crypto";
import {
  AccessGroupEntryResponse,
  ChatType,
  DecryptedMessageEntryResponse,
  NewMessageEntryResponse,
} from "deso-protocol-types";
import { ec } from "elliptic";
import * as sha256 from "sha256";
import { DESO_NETWORK } from "../utils/constants";
import { desoAPI } from "./deso.service";

export const PUBLIC_KEY_PREFIXES = {
  mainnet: {
    bitcoin: [0x00],
    deso: [0xcd, 0x14, 0x0],
  },
  testnet: {
    bitcoin: [0x6f],
    deso: [0x11, 0xc2, 0x0],
  },
};

export const privateKeyToDeSoPublicKey = (privateKey: ec.KeyPair): string => {
  const prefix = PUBLIC_KEY_PREFIXES[DESO_NETWORK].deso;
  const key = privateKey.getPublic().encode("array", true);
  const prefixAndKey = Uint8Array.from([...prefix, ...key]);
  return bs58check.encode(prefixAndKey);
};

export const seedHexToPrivateKey = (seedHex: string): ec.KeyPair => {
  const EC = new ec("secp256k1");
  return EC.keyFromPrivate(seedHex);
};

function publicKeyToECBuffer(publicKey: string): Buffer {
  const publicKeyEC = publicKeyToECKeyPair(publicKey);

  return new Buffer(publicKeyEC.getPublic("array"));
}

function publicKeyToECKeyPair(publicKey: string): ec.KeyPair {
  // Sanity check similar to Base58CheckDecodePrefix from core/lib/base58.go
  if (publicKey.length < 5) {
    throw new Error("Failed to decode public key");
  }
  const decoded = bs58check.decode(publicKey);
  const payload = Uint8Array.from(decoded).slice(3);

  const EC = new ec("secp256k1");
  return EC.keyFromPublic(payload, "array");
}

export const encryptShared = function (
  privateKeySender: Buffer,
  publicKeyRecipient: Buffer,
  msg: string,
  opts: { iv?: Buffer; legacy?: boolean; ephemPrivateKey?: Buffer } = {}
) {
  opts = opts || {};
  const sharedPx = derive(privateKeySender, publicKeyRecipient);
  const sharedPrivateKey = kdf(sharedPx, 32);
  const sharedPublicKey = getPublic(sharedPrivateKey);

  opts.legacy = false;
  return encrypt(sharedPublicKey, msg, opts);
};

export const derive = function (privateKeyA: Buffer, publicKeyB: Buffer) {
  assert(Buffer.isBuffer(privateKeyA), "Bad input");
  assert(Buffer.isBuffer(publicKeyB), "Bad input");
  assert(privateKeyA.length === 32, "Bad private key");
  assert(publicKeyB.length === 65, "Bad public key");
  assert(publicKeyB[0] === 4, "Bad public key");
  const EC = new ec("secp256k1");
  const keyA = EC.keyFromPrivate(privateKeyA);
  const keyB = EC.keyFromPublic(publicKeyB);
  const Px = keyA.derive(keyB.getPublic()); // BN instance
  return new Buffer(Px.toArray());
};

function assert(condition: boolean, message: string | undefined) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

export const kdf = function (secret: Buffer, outputLength: number) {
  let ctr = 1;
  let written = 0;
  let result = Buffer.from("");
  while (written < outputLength) {
    const ctrs = Buffer.from([ctr >> 24, ctr >> 16, ctr >> 8, ctr]);
    const hashResult = createHash("sha256")
      .update(Buffer.concat([ctrs, secret]))
      .digest();
    result = Buffer.concat([result, hashResult]);
    written += 32;
    ctr += 1;
  }
  return result;
};

export const getPublic = function (privateKey: Buffer): Buffer {
  assert(privateKey.length === 32, "Bad private key");
  const EC = new ec("secp256k1");
  return new Buffer(EC.keyFromPrivate(privateKey).getPublic("array"));
};

export const encrypt = function (
  publicKeyTo: Buffer,
  msg: string,
  opts: { iv?: Buffer; legacy?: boolean; ephemPrivateKey?: Buffer }
) {
  opts = opts || {};
  const ephemPrivateKey = opts.ephemPrivateKey || randomBytes(32);
  const ephemPublicKey = getPublic(ephemPrivateKey);

  const sharedPx = derive(ephemPrivateKey, publicKeyTo);
  const hash = kdf(sharedPx, 32);
  const iv = (opts.iv as Buffer) || randomBytes(16);
  const encryptionKey = hash.slice(0, 16);

  // Generate hmac
  const macKey = createHash("sha256").update(hash.slice(16)).digest();

  let ciphertext;
  if (opts.legacy) {
    ciphertext = Buffer.from(aesCtrEncryptLegacy(iv, encryptionKey, msg));
  } else {
    ciphertext = aesCtrEncrypt(iv, encryptionKey, msg);
  }

  const dataToMac = Buffer.concat([iv, ciphertext]);
  const HMAC = hmacSha256Sign(macKey, dataToMac);

  return Buffer.concat([ephemPublicKey, iv, ciphertext, HMAC]);
};

const aesCtrEncryptLegacy = function (
  counter: Buffer,
  key: Buffer,
  data: string
) {
  const cipher = createCipheriv("aes-128-ctr", key, counter);
  return cipher.update(data).toString();
};
const aesCtrEncrypt = function (counter: Buffer, key: Buffer, data: string) {
  const cipher = createCipheriv("aes-128-ctr", key, counter);
  const firstChunk = cipher.update(data);
  const secondChunk = cipher.final();
  return Buffer.concat([firstChunk, secondChunk]);
};

function hmacSha256Sign(key: Buffer, msg: Buffer) {
  return createHmac("sha256", key).update(msg).digest();
}

// TODO: better typing
export const decryptAccessGroupMessages = (
  userPublicKeyBase58Check: string,
  messages: NewMessageEntryResponse[],
  accessGroups: AccessGroupEntryResponse[],
  options?: { decryptedKey: string }
): DecryptedMessageEntryResponse[] => {
  return (messages || []).map((m) =>
    decryptAccessGroupMessage(
      userPublicKeyBase58Check,
      m,
      accessGroups,
      options
    )
  );
};

export const decryptAccessGroupMessage = (
  userPublicKeyBase58Check: string,
  message: NewMessageEntryResponse,
  accessGroups: AccessGroupEntryResponse[],
  options?: { decryptedKey: string }
): DecryptedMessageEntryResponse => {
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
          decryptAccessGroupMessageFromPrivateMessagingKey(
            options.decryptedKey,
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
    const encryptedKey =
      accessGroup.AccessGroupMemberEntryResponse.EncryptedKey;
    try {
      const decryptedKey = decryptAccessGroupPrivateKeyToMemberDefaultKey(
        Buffer.from(options.decryptedKey, "hex"),
        Buffer.from(encryptedKey, "hex")
      );
      const privateEncryptionKey = decryptedKey
        .getPrivate()
        .toArrayLike(Buffer, undefined, 32);
      const decryptedMessageBuffer =
        decryptAccessGroupMessageFromPrivateMessagingKey(
          privateEncryptionKey.toString("hex"),
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
  privateMessagingKey: string,
  userPublicKeyBase58Check: string,
  userMessagingKeyName: string,
  message: NewMessageEntryResponse
) {
  const groupPrivateEncryptionKeyBuffer = seedHexToPrivateKey(
    privateMessagingKey
  )
    .getPrivate()
    .toArrayLike(Buffer, undefined, 32);
  const isRecipient =
    message.RecipientInfo.OwnerPublicKeyBase58Check ===
      userPublicKeyBase58Check &&
    message.RecipientInfo.AccessGroupKeyName === userMessagingKeyName;
  const publicEncryptionKey = publicKeyToECBuffer(
    message.ChatType === ChatType.GROUPCHAT
      ? message.SenderInfo.AccessGroupPublicKeyBase58Check
      : isRecipient
      ? (message.SenderInfo.AccessGroupPublicKeyBase58Check as string)
      : (message.RecipientInfo.AccessGroupPublicKeyBase58Check as string)
  );
  return decryptShared(
    groupPrivateEncryptionKeyBuffer,
    publicEncryptionKey,
    Buffer.from(message.MessageInfo.EncryptedText, "hex")
  );
}

export const decryptShared = function (
  privateKeyRecipient: Buffer,
  publicKeySender: Buffer,
  encrypted: Buffer,
  opts: { legacy?: boolean } = {}
) {
  opts = opts || {};
  const sharedPx = derive(privateKeyRecipient, publicKeySender);
  const sharedPrivateKey = kdf(sharedPx, 32);

  opts.legacy = false;
  return decrypt(sharedPrivateKey, encrypted, opts);
};

export const decrypt = function (
  privateKey: Buffer,
  encrypted: Buffer,
  opts: { legacy?: boolean }
) {
  opts = opts || {};
  const metaLength = 1 + 64 + 16 + 32;
  assert(
    encrypted.length > metaLength,
    "Invalid Ciphertext. Data is too small"
  );
  assert(encrypted[0] >= 2 && encrypted[0] <= 4, "Not valid ciphertext.");

  // deserialize
  const ephemPublicKey = encrypted.slice(0, 65);
  const cipherTextLength = encrypted.length - metaLength;
  const iv = encrypted.slice(65, 65 + 16);
  const cipherAndIv = encrypted.slice(65, 65 + 16 + cipherTextLength);
  const ciphertext = cipherAndIv.slice(16);
  const msgMac = encrypted.slice(65 + 16 + cipherTextLength);

  // check HMAC
  const px = derive(privateKey, ephemPublicKey);
  const hash = kdf(px, 32);
  const encryptionKey = hash.slice(0, 16);
  const macKey = createHash("sha256").update(hash.slice(16)).digest();
  const dataToMac = Buffer.from(cipherAndIv);
  const hmacGood = hmacSha256Sign(macKey, dataToMac);
  assert(hmacGood.equals(msgMac), "Incorrect MAC");

  // decrypt message
  if (opts.legacy) {
    return aesCtrDecryptLegacy(iv, encryptionKey, ciphertext);
  } else {
    return aesCtrDecrypt(iv, encryptionKey, ciphertext);
  }
};

const aesCtrDecryptLegacy = function (
  counter: Buffer,
  key: Buffer,
  data: Buffer
) {
  const cipher = createDecipheriv("aes-128-ctr", key, counter);
  return cipher.update(data).toString();
};

const aesCtrDecrypt = function (counter: Buffer, key: Buffer, data: Buffer) {
  const cipher = createDecipheriv("aes-128-ctr", key, counter);
  const firstChunk = cipher.update(data);
  const secondChunk = cipher.final();
  return Buffer.concat([firstChunk, secondChunk]);
};

export const encryptAndSendNewMessage = async (
  messageToSend: string,
  appUser: AppUser | null,
  RecipientPublicKeyBase58Check: string,
  RecipientMessagingKeyName = "default-key",
  SenderMessagingKeyName = "default-key"
): Promise<string> => {
  if (!appUser) {
    return Promise.reject("appUser is undefined");
  }

  if (SenderMessagingKeyName !== "default-key") {
    return Promise.reject("sender must use default key for now");
  }

  const response = await desoAPI.accessGroup.CheckPartyAccessGroups({
    SenderPublicKeyBase58Check: appUser.PublicKeyBase58Check,
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

  // TODO: we can kill this later, but it's nice to ensure that we can actually decrypt the
  // message we've just encrypted.
  // const decryptedMessage = await decryptAccessGroupMessage(
  //   deso.identity.getUserKey() as string,
  //   {
  //     SenderInfo: {
  //       OwnerPublicKeyBase58Check: deso.identity.getUserKey() as string,
  //       AccessGroupKeyName: response.SenderAccessGroupKeyName,
  //       AccessGroupPublicKeyBase58Check: response.SenderAccessGroupPublicKeyBase58Check,
  //     },
  //     RecipientInfo: {
  //       OwnerPublicKeyBase58Check: response.RecipientPublicKeyBase58Check,
  //       AccessGroupKeyName: response.RecipientAccessGroupKeyName,
  //       AccessGroupPublicKeyBase58Check: isUnencrypted ? response.RecipientPublicKeyBase58Check : response.RecipientAccessGroupPublicKeyBase58Check,
  //     },
  //     MessageInfo: {
  //       EncryptedText: message,
  //       TimestampNanos: 0,
  //       ExtraData,
  //     },
  //     ChatType: ChatType.DM,
  //   },
  //   [],
  //   { decryptedKey: messagingPrivateKey },
  // );

  // if (decryptedMessage.error) {
  //   return Promise.reject('error decrypting message we just encrypted. encrypt/decrypt broken');
  // }

  if (!message) {
    return Promise.reject("error encrypting message");
  }

  const requestBody = {
    SenderAccessGroupOwnerPublicKeyBase58Check: appUser.PublicKeyBase58Check,
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

  return signedTx.TransactionHex;
};

export function encryptMessageFromPrivateMessagingKey(
  privateMessagingKey: string,
  recipientPublicKey: string,
  message: string
) {
  const privateKey = seedHexToPrivateKey(privateMessagingKey);
  const groupPrivateEncryptionKeyBuffer = privateKey
    .getPrivate()
    .toArrayLike(Buffer, undefined, 32);
  const publicKeyBuffer = publicKeyToECBuffer(recipientPublicKey);
  return encryptShared(
    groupPrivateEncryptionKeyBuffer,
    publicKeyBuffer,
    message
  );
}

export interface AccessGroupPrivateInfo {
  AccessGroupPublicKeyBase58Check: string;
  AccessGroupPrivateKeyHex: string;
  AccessGroupKeyName: string;
}

export function deriveAccessGroupKey(
  defaultKeyPrivateKeyHex: string,
  groupKeyName: string
): Buffer {
  const secretHash = new Buffer(
    sha256.x2(new Buffer(defaultKeyPrivateKeyHex, "hex")),
    "hex"
  );
  const keyNameHash = new Buffer(
    sha256.x2(new Buffer(groupKeyName, "utf8")),
    "hex"
  );
  return new Buffer(sha256.x2(Buffer.concat([secretHash, keyNameHash])), "hex");
}

// TODO: this needs to be replaced by the lib
export function getAccessGroupStandardDerivation(
  defaultKeyPrivateKeyHex: string,
  newGroupKeyName: string
): AccessGroupPrivateInfo {
  const accessGroupPrivateKeyBuff = deriveAccessGroupKey(
    defaultKeyPrivateKeyHex,
    newGroupKeyName
  );
  const EC = new ec("secp256k1");

  const accessGroupPrivateKey = EC.keyFromPrivate(accessGroupPrivateKeyBuff);
  return {
    AccessGroupPublicKeyBase58Check: privateKeyToDeSoPublicKey(
      accessGroupPrivateKey
    ),
    AccessGroupPrivateKeyHex: accessGroupPrivateKeyBuff.toString("hex"),
    AccessGroupKeyName: newGroupKeyName,
  };
}

export function encryptAccessGroupPrivateKeyToMemberDefaultKey(
  memberDefaultKeyPublicKeyBase58Check: string,
  accessGroupPrivateKeyHex: string
): string {
  const memberDefaultKeyAccessGroupKeyPair = publicKeyToECKeyPair(
    memberDefaultKeyPublicKeyBase58Check
  );
  const accessGroupPkBuffer = new Buffer(
    memberDefaultKeyAccessGroupKeyPair.getPublic("array")
  );
  return encrypt(accessGroupPkBuffer, accessGroupPrivateKeyHex, {
    legacy: false,
  }).toString("hex");
}

export function decryptAccessGroupPrivateKeyToMemberDefaultKey(
  memberDefaultKeyPrivateKeyBuffer: Buffer,
  encryptedAccessGroupPrivateKey: Buffer
): ec.KeyPair {
  const memberAccessPriv = decrypt(
    memberDefaultKeyPrivateKeyBuffer,
    encryptedAccessGroupPrivateKey,
    { legacy: false }
  ).toString();
  const EC = new ec("secp256k1");
  return EC.keyFromPrivate(memberAccessPriv);
}
