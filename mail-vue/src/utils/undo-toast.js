import { h } from 'vue'
import { ElMessage } from 'element-plus'

// "Done · Undo" toast for one-gesture actions (swipe / E to archive), so a
// slip of the finger is one tap to reverse.
export function undoToast(text, undoLabel, onUndo, duration = 5000) {
	let handle = null
	handle = ElMessage({
		type: 'success',
		plain: true,
		grouping: false,
		duration,
		message: h('span', { class: 'undo-toast' }, [
			h('span', text),
			h('button', {
				type: 'button',
				class: 'undo-toast-btn',
				onClick: () => { handle?.close(); onUndo() },
			}, undoLabel),
		]),
	})
	return handle
}
