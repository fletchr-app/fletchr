import { modalController } from '@ionic/vue';

import ClaimSheet from '@/components/ClaimSheet.vue';
import { setClaimGate } from '@/composables/useAuth';
import { useEquipment } from '@/composables/useEquipment';
import { useLog } from '@/composables/useLog';
import { useMedia } from '@/composables/useMedia';
import { useNotes } from '@/composables/useNotes';
import { useUploadSettings } from '@/composables/useUploadSettings';
import type { ClaimGate, Decision } from '@/lib/claim-flow';
import { claimLocal, localCounts, readLocal } from '@/lib/local-claim';
import { dataStore } from '@/lib/local-store';

// Signing in or registering with data from local mode (#93): the confirmation, and the move of the local stores into the
// account's. A module of its own because it needs every store, and the stores build on `useAuth`, which calls it through
// `setClaimGate`. Imported once by `main.ts`.
const log = useLog();
const equipment = useEquipment();
const notes = useNotes();
const media = useMedia();
const { videosWifiOnly } = useUploadSettings();

const stores = [log.keyed, equipment.keyed, notes.keyed, media.keyed];

const gate: ClaimGate = {
  async counts(localId) {
    // The stores save at once; this makes sure the device holds the latest before it is read.
    await Promise.all(stores.map((s) => s.flush())).catch(() => {});
    const local = await readLocal(dataStore, localId);
    return 'stores' in local ? localCounts(local.stores) : null;
  },
  async ask({ email, counts }) {
    const modal = await modalController.create({
      component: ClaimSheet,
      componentProps: { email, counts, videosWifiOnly: videosWifiOnly.value },
      backdropDismiss: false,
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<Decision>();
    return role === 'decision' && data ? data : { kind: 'cancel' };
  },
  async upload({ localId, account, userId, share }) {
    // Hold the stores first: a save after the local keys are removed would bring them back.
    stores.forEach((s) => s.hold());
    try {
      await Promise.all(stores.map((s) => s.flush()));
      const result = await claimLocal(dataStore, { localId, account, userId, share });
      if (result.ok) return true; // the hold ends when the stores switch to the account's key
    } catch {
      // fall through: nothing was removed
    }
    stores.forEach((s) => s.release());
    return false;
  },
};

setClaimGate(gate);
