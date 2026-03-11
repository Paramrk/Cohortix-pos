import { readFileSync, writeFileSync } from 'fs';

const path = 'src/components/MenuManager.tsx';
let text = readFileSync(path, 'utf8');

// Normalize line endings to LF for simpler matching
text = text.replace(/\r\n/g, '\n');

// Patch 1: Add "Add New Category" button inside the form's category flex row
const target1 = `                  </button>
                ))}
              </div>
            </div>

            {/* Prices — all in one section */}`;

const repl1 = `                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleAddNewCategory}
                  className="px-4 py-2 rounded-xl text-sm font-bold border-2 border-dashed border-slate-300 text-slate-500 hover:bg-slate-50 hover:text-indigo-600 hover:border-indigo-400 transition-colors flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" /> Add New
                </button>
              </div>
            </div>

            {/* Prices — all in one section */}`;

if (text.includes(target1)) {
  text = text.replace(target1, repl1);
  console.log('✅ Patch 1 applied');
} else {
  console.warn('⚠️  Patch 1 target not found');
}

// Patch 2: Show empty categories in list view with delete button
const target2 = `      {/* List */}
      <div className="space-y-8">
        {allCategories.map((category) => {
          const items = menuItems.filter((item) => item.category === category);
          if (items.length === 0) return null;
          return (
            <div key={category} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="bg-slate-50 px-6 py-3 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-slate-400" />
                  <h3 className="font-bold text-slate-700 uppercase tracking-wider text-sm">
                    {CATEGORY_ICONS[category] ?? '\\u{1F361}'} {category}
                  </h3>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => { void handleRenameCategory(category); }}
                    disabled={isBulkEdit || renamingCategory !== null}
                    className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {renamingCategory === category ? 'Renaming...' : 'Rename Category'}
                  </button>
                  {category === 'Regular' && (`;

const repl2 = `      {/* List */}
      <div className="space-y-8">
        {allCategories.map((category) => {
          const items = menuItems.filter((item) => item.category === category);
          return (
            <div key={category} className={\`bg-white rounded-2xl shadow-sm border \${items.length === 0 ? 'border-dashed border-slate-300 opacity-70' : 'border-slate-100'} overflow-hidden\`}>
              <div className="bg-slate-50 px-6 py-3 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-slate-400" />
                  <h3 className="font-bold text-slate-700 uppercase tracking-wider text-sm flex items-center gap-2">
                    {CATEGORY_ICONS[category] ?? '\\u{1F361}'} {category}
                    {items.length === 0 && <span className="text-[10px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full">EMPTY</span>}
                  </h3>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => { void handleRenameCategory(category); }}
                    disabled={isBulkEdit || renamingCategory !== null}
                    className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {renamingCategory === category ? 'Renaming...' : 'Rename Category'}
                  </button>
                  {items.length === 0 && !DEFAULT_CATEGORIES.includes(category) && (
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(category)}
                      className="border border-rose-200 text-rose-600 rounded-lg px-3 py-1.5 text-xs font-medium bg-white hover:bg-rose-50 transition-colors flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete Empty Category
                    </button>
                  )}
                  {category === 'Regular' && (`;

if (text.includes(target2)) {
  text = text.replace(target2, repl2);
  console.log('✅ Patch 2 applied');
} else {
  console.warn('⚠️  Patch 2 target not found');
}

// Patch 3: After the list.map, make sure empty categories still close their div (no items div)
// We need to add a fallback "No items" message inside empty categories
const target3 = `              <div className="divide-y divide-slate-100">
                {items.map((item) => {`;

const repl3 = `              {items.length === 0 ? (
                <div className="px-6 py-8 text-center text-slate-400 text-sm">
                  No items in this category yet. Add a menu item above and select this category.
                </div>
              ) : (
              <div className="divide-y divide-slate-100">
                {items.map((item) => {`;

if (text.includes(target3)) {
  text = text.replace(target3, repl3);
  console.log('✅ Patch 3 applied');
} else {
  console.warn('⚠️  Patch 3 target not found');
}

// We also need to close the conditional bracket we opened.
// The items.map section closes with two </div> before the next category.
// We add a closing ) for the ternary.
const target4 = `              </div>
            </div>
          );
        })}
      </div>`;

const repl4 = `              </div>
              )}
            </div>
          );
        })}
      </div>`;

if (text.includes(target4)) {
  text = text.replace(target4, repl4);
  console.log('✅ Patch 4 applied');
} else {
  console.warn('⚠️  Patch 4 target not found');
}

writeFileSync(path, text, 'utf8');
console.log('Done writing file.');
