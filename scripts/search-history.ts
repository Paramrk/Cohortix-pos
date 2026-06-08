import * as fs from 'fs';
import * as path from 'path';

async function searchHistory() {
  const historyPath = path.join(process.env.APPDATA || '', 'Microsoft/Windows/PowerShell/PSReadLine/ConsoleHost_history.txt');
  console.log('Searching history file at:', historyPath);
  
  if (!fs.existsSync(historyPath)) {
    console.log('History file does not exist.');
    return;
  }
  
  const content = fs.readFileSync(historyPath, 'utf8');
  const lines = content.split('\n');
  
  console.log('Total history lines:', lines.length);
  
  const keywords = ['supabase', 'link', 'db', 'password', 'ludxchxyqbbdfibsdkwl'];
  const matches = lines.filter(line => 
    keywords.some(keyword => line.toLowerCase().includes(keyword))
  );
  
  console.log(`Found ${matches.length} matching lines:`);
  matches.forEach((line, index) => {
    console.log(`${index + 1}: ${line.trim()}`);
  });
}

searchHistory().catch(console.error);
