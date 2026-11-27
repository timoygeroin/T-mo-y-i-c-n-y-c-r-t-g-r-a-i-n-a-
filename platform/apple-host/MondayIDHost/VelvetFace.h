#pragma once
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
typedef struct VelvetFace VelvetFace;
VelvetFace *velvet_face_open(const char *model_path, char *error, int capacity);
int velvet_face_predict(VelvetFace *face, const float *windows, const float *emotion,
                        int count, float *weights, char *error, int capacity);
void velvet_face_close(VelvetFace *face);
#ifdef __cplusplus
}
#endif
