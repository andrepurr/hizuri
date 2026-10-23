/* Speex echo canceller + residual echo suppression for hizuri, built to WASM. */
#include <stdlib.h>
#include <speex/speex_echo.h>
#include <speex/speex_preprocess.h>
typedef struct { SpeexEchoState *echo; SpeexPreprocessState *pp; int frame; short *mic, *ref, *out; } Aec;
__attribute__((export_name("aec_new"))) Aec *aec_new(int frame, int tail, int rate) {
  Aec *a = calloc(1, sizeof(Aec)); int off = 0;
  a->frame = frame; a->echo = speex_echo_state_init(frame, tail); a->pp = speex_preprocess_state_init(frame, rate);
  speex_echo_ctl(a->echo, SPEEX_ECHO_SET_SAMPLING_RATE, &rate);
  speex_preprocess_ctl(a->pp, SPEEX_PREPROCESS_SET_ECHO_STATE, a->echo);
  speex_preprocess_ctl(a->pp, SPEEX_PREPROCESS_SET_DENOISE, &off);
  a->mic = calloc(frame, 2); a->ref = calloc(frame, 2); a->out = calloc(frame, 2);
  return a;
}
__attribute__((export_name("aec_mic"))) short *aec_mic(Aec *a) { return a->mic; }
__attribute__((export_name("aec_ref"))) short *aec_ref(Aec *a) { return a->ref; }
__attribute__((export_name("aec_out"))) short *aec_out(Aec *a) { return a->out; }
__attribute__((export_name("aec_run"))) void aec_run(Aec *a) {
  speex_echo_cancellation(a->echo, a->mic, a->ref, a->out);
  speex_preprocess_run(a->pp, a->out);
}
__attribute__((export_name("aec_free"))) void aec_free(Aec *a) {
  speex_echo_state_destroy(a->echo); speex_preprocess_state_destroy(a->pp);
  free(a->mic); free(a->ref); free(a->out); free(a);
}
