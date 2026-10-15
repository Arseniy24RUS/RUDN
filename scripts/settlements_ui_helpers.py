"""Shared visible-UI actions for the platform's training dialogs."""


def accept_training_dialog(page, kind, *, expect_open=False):
    """Continue a visible training gate; already closed gates are a no-op.

    A caller that has just entered or completed training sets expect_open so
    the action waits for that new gate instead of racing its asynchronous mount.
    """
    if kind not in ("welcome", "complete"):
        raise ValueError(f"Unknown training dialog: {kind}")
    dialog = page.locator(f'.training-dialog[open][data-training-kind="{kind}"]')
    if expect_open:
        dialog.wait_for(state="visible", timeout=60000)
    if not dialog.is_visible():
        return False
    dialog.locator('[data-action="training-continue"]').click()
    dialog.wait_for(state="hidden")
    return True
