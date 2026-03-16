import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

type CsvRow = Record<string, string>;

interface MenuRow {
  id: string;
  name: string;
  category: string | null;
  shop_id: string | null;
}

function parseCsv(input: string) {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      row.push(field);
      if (row.some((entry) => entry.trim() !== '')) {
        rows.push(row);
      }
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((entry) => entry.trim() !== '')) {
    rows.push(row);
  }

  if (rows.length === 0) return [];

  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map((header) => header.trim());
  return dataRows.map((dataRow) => {
    const record: CsvRow = {};
    headers.forEach((header, index) => {
      record[header] = (dataRow[index] ?? '').trim();
    });
    return record;
  });
}

function parseList(value: string) {
  return value
    .split('|')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function getArgFilePath() {
  const cliPath = process.argv[2];
  if (!cliPath) {
    throw new Error('Usage: tsx scripts/import-menu-ai-profiles.ts <csv-file>');
  }
  return path.resolve(process.cwd(), cliPath);
}

async function main() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set before running this import.');
  }

  const filePath = getArgFilePath();
  const csvInput = await readFile(filePath, 'utf8');
  const rows = parseCsv(csvInput);

  if (rows.length === 0) {
    throw new Error('The CSV file is empty.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: menuRows, error: menuError } = await supabase
    .from('menu_items')
    .select('id, name, category, shop_id')
    .order('created_at');

  if (menuError) {
    throw new Error(`Failed to load menu_items: ${menuError.message}`);
  }

  const menuItems = (menuRows ?? []) as MenuRow[];
  const unresolved: Array<{ menuName: string; reason: string }> = [];
  const upserts: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    const shopId = row.shop_id?.trim() || 'main';
    const menuName = row.menu_name?.trim();
    if (!menuName) {
      unresolved.push({ menuName: '(missing menu_name)', reason: 'menu_name is required' });
      continue;
    }

    const normalizedMenuName = normalizeName(menuName);
    const category = row.category?.trim() || null;
    const exactMatches = menuItems.filter((item) =>
      (item.shop_id ?? 'main') === shopId &&
      normalizeName(item.name) === normalizedMenuName,
    );

    let matchedItem: MenuRow | undefined;
    if (exactMatches.length === 1) {
      matchedItem = exactMatches[0];
    } else if (exactMatches.length > 1 && category) {
      matchedItem = exactMatches.find((item) => normalizeName(item.category ?? '') === normalizeName(category));
    }

    if (!matchedItem) {
      unresolved.push({
        menuName,
        reason: exactMatches.length > 1
          ? 'Multiple menu items matched this name. Provide category in the CSV row.'
          : 'No menu item matched this name.',
      });
      continue;
    }

    upserts.push({
      shop_id: shopId,
      menu_item_id: matchedItem.id,
      menu_item_name: matchedItem.name,
      category: category ?? matchedItem.category,
      aliases_en: parseList(row.aliases_en ?? ''),
      aliases_gu: parseList(row.aliases_gu ?? ''),
      description_en: row.description_en?.trim() ?? '',
      description_gu: row.description_gu?.trim() ?? '',
      flavor_tags: parseList(row.flavor_tags ?? ''),
      ingredient_tags: parseList(row.ingredient_tags ?? ''),
      texture_tags: parseList(row.texture_tags ?? ''),
      best_for: parseList(row.best_for ?? ''),
      recommended_variant: row.recommended_variant?.trim() || null,
      recommended_quantity: row.recommended_quantity?.trim()
        ? Math.max(1, Math.min(20, Math.round(Number(row.recommended_quantity))))
        : null,
    });
  }

  if (upserts.length > 0) {
    const { error: upsertError } = await supabase
      .from('menu_item_ai_profiles')
      .upsert(upserts, {
        onConflict: 'shop_id,menu_item_name',
      });

    if (upsertError) {
      throw new Error(`Failed to upsert menu_item_ai_profiles: ${upsertError.message}`);
    }
  }

  console.log(`Imported ${upserts.length} AI profile row(s).`);
  if (unresolved.length > 0) {
    console.log(`Skipped ${unresolved.length} unresolved row(s):`);
    for (const item of unresolved) {
      console.log(`- ${item.menuName}: ${item.reason}`);
    }
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
