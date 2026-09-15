const fs = require('fs');

const modal = fs.readFileSync('src/components/TaskModal.tsx', 'utf8');

// Find the start and end of the grid that holds all basic info
const startGrid = modal.indexOf('<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">');
const endGrid = modal.indexOf('</form>'); // We could extract the whole form, but maybe just the fields inside?

// Let's just create a TaskBasicInfo.tsx for now to hold everything from startGrid to endGrid
