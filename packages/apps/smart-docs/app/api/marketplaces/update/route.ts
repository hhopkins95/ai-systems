import { NextResponse } from 'next/server';
import { spawn } from 'child_process';

export async function POST(request: Request) {
  try {
    const { name } = await request.json();

    if (!name) {
      return NextResponse.json(
        { error: 'Missing required field: name' },
        { status: 400 }
      );
    }

    // Execute CLI command: claude plugin marketplace update <name>
    const result = await new Promise<{ success: boolean; output: string }>((resolve) => {
      const proc = spawn('claude', ['plugin', 'marketplace', 'update', name], {
        shell: true,
      });

      let output = '';
      let errorOutput = '';

      proc.stdout?.on('data', (data) => {
        output += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });

      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          output: output || errorOutput,
        });
      });

      proc.on('error', (err) => {
        resolve({
          success: false,
          output: err.message,
        });
      });
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.output || 'Failed to update marketplace' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Marketplace "${name}" updated successfully`,
    });
  } catch (error) {
    console.error('Error updating marketplace:', error);
    return NextResponse.json(
      { error: 'Failed to update marketplace' },
      { status: 500 }
    );
  }
}
