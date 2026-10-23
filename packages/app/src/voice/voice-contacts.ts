import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { z } from "zod";
import { readValidatedJson } from "@/storage/validated-storage";
import type { VoiceSessionStorage } from "./voice-session-store";

const VOICE_CONTACTS_STORAGE_KEY = "@hizuri:voice-contacts-v1";
/** Enough for every chat the user talks to by voice; the oldest drop off first. */
export const VOICE_CONTACTS_LIMIT = 24;

const VoiceContactSchema = z.object({
  serverId: z.string().min(1),
  agentId: z.string().min(1),
});
const VoiceContactsSchema = z.array(VoiceContactSchema);

export type VoiceContact = z.infer<typeof VoiceContactSchema>;

/**
 * Hizuri (voice follows the chat): the agents this device has held voice
 * with, newest first. Their voice prompt stays on the host, so voice can move to one of them
 * while it is busy: nothing reloads and no running turn is cut.
 */
export interface VoiceContacts {
  load(): Promise<void>;
  has(serverId: string, agentId: string): boolean;
  remember(serverId: string, agentId: string): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): readonly VoiceContact[];
}

function isContact(contact: VoiceContact, serverId: string, agentId: string): boolean {
  return contact.serverId === serverId && contact.agentId === agentId;
}

function withFirst(list: readonly VoiceContact[], first: VoiceContact): VoiceContact[] {
  const rest = list.filter((contact) => !isContact(contact, first.serverId, first.agentId));
  return [first, ...rest].slice(0, VOICE_CONTACTS_LIMIT);
}

export function createVoiceContacts(storage: VoiceSessionStorage = AsyncStorage): VoiceContacts {
  let contacts: readonly VoiceContact[] = [];
  let loading: Promise<void> | null = null;
  let loaded = false;
  const listeners = new Set<() => void>();

  function publish(next: readonly VoiceContact[]): void {
    contacts = next;
    for (const listener of listeners) listener();
  }

  function save(): void {
    void storage.setItem(VOICE_CONTACTS_STORAGE_KEY, JSON.stringify(contacts)).catch((error) => {
      console.warn("[VoiceContacts] Failed to save the voice contacts:", error);
    });
  }

  return {
    load() {
      loading ??= readValidatedJson(storage, VOICE_CONTACTS_STORAGE_KEY, VoiceContactsSchema)
        .then((stored) => {
          const early = contacts;
          // Contacts remembered before storage was read stay in front.
          publish(early.reduceRight(withFirst, stored ?? []));
          return early.length > 0;
        })
        .catch((error: unknown) => {
          console.warn("[VoiceContacts] Failed to read the voice contacts:", error);
          return contacts.length > 0;
        })
        .then((changed) => {
          loaded = true;
          if (changed) save();
          return undefined;
        });
      return loading;
    },
    has(serverId, agentId) {
      return contacts.some((contact) => isContact(contact, serverId, agentId));
    },
    remember(serverId, agentId) {
      if (contacts[0] && isContact(contacts[0], serverId, agentId)) return;
      publish(withFirst(contacts, { serverId, agentId }));
      // Before storage is read, a write would wipe the stored list; load() saves the merge.
      if (loaded) save();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => contacts,
  };
}

export const voiceContacts = createVoiceContacts();

export function useIsVoiceContact(serverId: string, agentId: string | null | undefined): boolean {
  const contacts = useSyncExternalStore(
    voiceContacts.subscribe,
    voiceContacts.getSnapshot,
    voiceContacts.getSnapshot,
  );
  return agentId ? contacts.some((contact) => isContact(contact, serverId, agentId)) : false;
}
