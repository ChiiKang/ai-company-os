import { Button, Icon, Modal, useToast } from "@/components/ui";
import { usePortal } from "@/store/PortalProvider";
import { formatDate } from "@/lib/format";

export function CancelPlanModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { wallet } = usePortal();
  const toast = useToast();
  const renews = formatDate(wallet.renewsAt, { month: "long", day: "numeric", year: "numeric" });

  return (
    <Modal open={open} onClose={onClose} title="Cancel plan">
      <div className="pm-form">
        <div className="cancel-warn">
          <span className="cancel-warn-icon"><Icon name="alert" size={18} /></span>
          <div>
            <p>Your agents stop working at the end of the billing period. Leads and transcripts are kept for 90 days.</p>
            <p className="small faint" style={{ marginTop: 6 }}>Your plan stays active until {renews}. Unused credits remain in your wallet.</p>
          </div>
        </div>
        <div className="buy-foot">
          <Button variant="danger" onClick={() => { toast(`Cancellation requested — your plan runs until ${renews}`, "neutral"); onClose(); }}>Cancel plan</Button>
          <Button variant="primary" autoFocus onClick={onClose}>Keep my plan</Button>
        </div>
      </div>
    </Modal>
  );
}
