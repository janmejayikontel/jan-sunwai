package gov.rajasthan.jansunwai

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.*
import androidx.appcompat.app.AppCompatActivity

class CrashActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val errorMessage = intent.getStringExtra("error_message") ?: "Unknown error occurred"
        val stackTrace = intent.getStringExtra("stack_trace") ?: "No stack trace available"

        val rootLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#020617"))
            setPadding(40, 60, 40, 40)
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        // Title
        val titleView = TextView(this).apply {
            text = "⚠️ Jan Sunwai App Error"
            textSize = 20f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor("#f87171"))
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 16)
        }
        rootLayout.addView(titleView)

        // Subtitle
        val subtitleView = TextView(this).apply {
            text = "The application encountered a startup issue. Details:"
            textSize = 13f
            setTextColor(Color.parseColor("#94a3b8"))
            setPadding(0, 0, 0, 20)
        }
        rootLayout.addView(subtitleView)

        // Scrollable error container
        val scrollView = ScrollView(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1.0f
            )
            setBackgroundColor(Color.parseColor("#0f172a"))
            setPadding(24, 24, 24, 24)
        }

        val errorTextView = TextView(this).apply {
            text = "$errorMessage\n\n$stackTrace"
            textSize = 12f
            setTypeface(Typeface.MONOSPACE)
            setTextColor(Color.parseColor("#fbbf24"))
            setTextIsSelectable(true)
        }
        scrollView.addView(errorTextView)
        rootLayout.addView(scrollView)

        // Button Container
        val buttonLayout = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 24, 0, 0)
            gravity = Gravity.CENTER
        }

        val copyButton = Button(this).apply {
            text = "📋 Copy Error Details"
            setBackgroundColor(Color.parseColor("#334155"))
            setTextColor(Color.WHITE)
            setOnClickListener {
                val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                val clip = ClipData.newPlainText("JanSunwai Error", "$errorMessage\n\n$stackTrace")
                clipboard.setPrimaryClip(clip)
                Toast.makeText(context, "Error copied to clipboard!", Toast.LENGTH_SHORT).show()
            }
        }
        buttonLayout.addView(copyButton)

        val restartButton = Button(this).apply {
            text = "🔄 Restart App"
            setBackgroundColor(Color.parseColor("#059669"))
            setTextColor(Color.WHITE)
            setOnClickListener {
                val restartIntent = Intent(context, MainActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                }
                startActivity(restartIntent)
                finish()
            }
        }
        buttonLayout.addView(restartButton)

        rootLayout.addView(buttonLayout)
        setContentView(rootLayout)
    }
}
