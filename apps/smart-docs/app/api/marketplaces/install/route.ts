import { NextResponse } from 'next/server';
import { spawn } from 'child_process';

export async function POST(request: Request) {
  try {
    const { source } = await request.json();

    if (!source) {
      return NextResponse.json(
        { error: 'Missing required field: source' },
        { status: 400 }
      );
    }

    // Execute CLI command: claude plugin marketplace add <source>
    const result = await new Promise<{ success: boolean; output: string }>((resolve) => {
      const proc = spawn('claude', ['plugin', 'marketplace', 'add', source], {
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
        { error: result.output || 'Failed to add marketplace' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Marketplace added successfully',
    });
  } catch (error) {
    console.error('Error adding marketplace:', error);
    return NextResponse.json(
      { error: 'Failed to add marketplace' },
      { status: 500 }
    );
  }
}
