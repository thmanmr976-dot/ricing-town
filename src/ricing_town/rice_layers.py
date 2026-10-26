"""Original Rice placement controls embedded beside owned desktop widgets."""
from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (QComboBox, QFormLayout, QLabel, QLineEdit,
    QListWidget, QListWidgetItem, QPushButton, QSpinBox, QVBoxLayout, QWidget)

from .rice_layout import layout_file, load_offsets, save_offsets, visual_components
from .rice_runner import verify_cache


class RiceLayers(QWidget):
    def __init__(self, owner):
        super().__init__()
        self.owner = owner
        self.components = {}; self.offsets = {}; self.cache = None
        box = QVBoxLayout(self); box.setContentsMargins(0, 0, 0, 0)
        box.addWidget(QLabel("ORIGINAL RICE · shared components"))
        self.interfaces = QComboBox(); box.addWidget(self.interfaces)
        self.search = QLineEdit(); self.search.setPlaceholderText("Find Rice component…")
        box.addWidget(self.search)
        self.items = QListWidget(); self.items.setMaximumHeight(120); box.addWidget(self.items)
        self.detail = QLabel(); self.detail.setWordWrap(True)
        self.detail.setTextFormat(Qt.TextFormat.PlainText); box.addWidget(self.detail)
        form = QFormLayout(); self.fields = {}
        for key, title, low, high, default in (("x", "Move horizontally", -2000, 2000, 0),
                ("y", "Move vertically", -2000, 2000, 0), ("scale", "Size %", 50, 200, 100)):
            field = QSpinBox(); field.setRange(low, high); field.setValue(default)
            field.valueChanged.connect(self.change); self.fields[key] = field
            form.addRow(title, field)
        box.addLayout(form)
        for title, callback in (("Reset selected Rice component", self.reset),
                                ("Save Rice placement", self.save),
                                ("Refresh saved Rice interfaces", self.reload)):
            action = QPushButton(title); action.clicked.connect(callback); box.addWidget(action)
        self.status = QLabel(); self.status.setWordWrap(True); box.addWidget(self.status)
        self.interfaces.currentIndexChanged.connect(self.load)
        self.items.currentItemChanged.connect(self.select)
        self.search.textChanged.connect(self.filter)
        self.reload()

    def reload(self):
        previous = self.interfaces.currentData()
        self.interfaces.blockSignals(True); self.interfaces.clear()
        for path in sorted((self.owner.store.path.parent / "rice-packages").glob("*/package.json")):
            try:
                meta = verify_cache(path.parent)
                for runtime in meta["runtimes"]:
                    if runtime["engine"] == "quickshell":
                        self.interfaces.addItem(meta["name"] + " · " + runtime["entry"],
                                                (str(path.parent), runtime))
            except (OSError, ValueError, KeyError):
                continue
        for index in range(self.interfaces.count()):
            if self.interfaces.itemData(index) == previous:
                self.interfaces.setCurrentIndex(index); break
        self.interfaces.blockSignals(False); self.load()

    def load(self):
        self.items.clear(); self.components = {}; self.offsets = {}; self.cache = None
        selected = self.interfaces.currentData()
        if not selected:
            self.status.setText("Import and keep a Quickshell interface to edit its placement here.")
            self.select(); return
        try:
            cache, self.runtime = selected; self.cache = Path(cache)
            self.components = visual_components(self.cache, self.runtime)
            self.path = layout_file(self.owner.store.path.parent, self.cache, self.runtime)
            self.offsets = load_offsets(self.path, self.components)
            for name, info in sorted(self.components.items()):
                item = QListWidgetItem(info["name"] + " · all instances")
                item.setData(Qt.ItemDataRole.UserRole, name); item.setToolTip(name)
                self.items.addItem(item)
            self.filter(self.search.text())
            self.items.setCurrentRow(0); self.select()
            self.status.setText("Saved placement loaded. Changes appear after a confirmed Run from Rice.")
        except (OSError, ValueError) as exc:
            self.cache = None; self.items.clear(); self.select()
            self.status.setText("Cannot load Rice placement: " + str(exc))

    def select(self, *_):
        item = self.items.currentItem()
        name = item.data(Qt.ItemDataRole.UserRole) if item else None
        values = self.offsets.get(name, {})
        for key, field in self.fields.items():
            field.blockSignals(True); field.setValue(values.get(key, 100 if key == "scale" else 0))
            field.setEnabled(item is not None); field.blockSignals(False)
        self.detail.setText((name + "\nShared definition: every instance moves and scales together. "
                            "Runtime instance counts and positions are unknown.") if name else
                            "No movable component selected. Native surfaces require an adapter.")
        if item:
            self.owner.canvas.selected_index = -1
            self.owner.canvas.update()

    def change(self):
        item = self.items.currentItem()
        if not item: return
        name = item.data(Qt.ItemDataRole.UserRole)
        value = {key: field.value() for key, field in self.fields.items()}
        self.offsets[name] = value
        self.status.setText(f"Unsaved · offset {value['x']}, {value['y']} px · size {value['scale']}% · all instances")

    def reset(self):
        if not self.items.currentItem(): return
        for key, field in self.fields.items(): field.setValue(100 if key == "scale" else 0)
        self.change()

    def save(self):
        if self.cache is None: return
        try:
            self.offsets = save_offsets(self.path, self.offsets, self.components)
            self.status.setText("Placement saved. Run from Rice to preview; source is unchanged. Reset and save restores original placement.")
        except (OSError, ValueError) as exc:
            self.status.setText("Cannot save placement: " + str(exc))

    def filter(self, text):
        for index in range(self.items.count()):
            item = self.items.item(index)
            item.setHidden(text.casefold() not in item.data(Qt.ItemDataRole.UserRole).casefold())
