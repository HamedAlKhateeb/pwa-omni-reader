/**
 * Design reminder — «مرسم التصفّح»: invisible local bridge, no cloud secret.
 * The agent merges the installed extension's storage, then mirrors local edits back.
 */
import { useEffect } from "react";
import { getExtensionSnapshot, hasExtensionReaderData, mergeExtensionBundle, extensionSnapshotToBundle, pushBundleToExtension } from "@/lib/extensionBridge";
import { localStore } from "@/lib/storage";

const fingerprint = (value: unknown) => JSON.stringify(value);

export default function ExtensionSyncAgent() {
  useEffect(() => {
    let disposed = false;
    let lastLocal = "";
    let lastExtension = "";
    const reconcile = async (initial = false) => {
      const extension = await getExtensionSnapshot();
      if (disposed || !extension || !hasExtensionReaderData(extension)) return;
      const local = await localStore.exportAll();
      const extensionFingerprint = fingerprint(extension);
      if (initial || extensionFingerprint !== lastExtension) {
        const merged = mergeExtensionBundle(local, extensionSnapshotToBundle(extension, local.settings));
        if (fingerprint(merged) !== fingerprint(local)) {
          await localStore.importAll(merged);
          if (!disposed) window.location.reload();
          return;
        }
      }
      lastExtension = extensionFingerprint;
      const localFingerprint = fingerprint(local);
      if (!initial && localFingerprint !== lastLocal) await pushBundleToExtension(local);
      lastLocal = localFingerprint;
    };
    reconcile(true).catch(() => undefined);
    const timer = window.setInterval(() => reconcile().catch(() => undefined), 4000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, []);
  return null;
}
