import {
  ChatType,
  DecryptedMessageEntryResponse,
  SubmitTransactionResponse,
} from "deso-protocol";

export interface Conversation {
  firstMessagePublicKey: string;
  messages: DecryptedMessageEntryResponse[];
  ChatType: ChatType;
}

export interface ConversationMap {
  [k: string]: Conversation;
}

export interface TransactionConstructionResponse {
  TransactionHex: string;
}

export interface ConstructAndSubmitResponse {
  TransactionConstructionResponse: TransactionConstructionResponse;
  SubmitTransactionResponse: SubmitTransactionResponse;
}
